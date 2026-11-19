#!/usr/bin/env node
/**
 * Pruebas de extremo a extremo del visor, en un navegador real.
 *   pnpm --filter @handy/web e2e            (requiere haber construido: pnpm build)
 * Si Playwright no está instalado se omiten con un aviso, salvo E2E_REQUIRED=1.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlaywright, openPage, startHandy } from "./harness.mjs";

const playwright = loadPlaywright();
if (!playwright) {
  console.log("Playwright no está disponible: pruebas de navegador omitidas.");
  process.exit(process.env.E2E_REQUIRED === "1" ? 1 : 0);
}
if (!existsSync(join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "index.html"))) {
  console.error("Falta construir el visor: pnpm build");
  process.exit(1);
}

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const only = process.argv[2];

// ---------------------------------------------------------------------------

test("carga el mundo, muestra precio y sincroniza con el archivo", async ({ h }) => {
  assert.equal((await h.world()).rooms.length, 2);
  assert.match(await h.page.textContent("#price-total"), /\d/);
  assert.match(await h.page.textContent("#sync"), /en vivo/);
});

test("clic en un muro dentro de la vista 3D lo selecciona", async ({ h }) => {
  const hit = await h.clickUntil((s) => s.kind === "wall" && s.roomId === "dormitorio" && s.wall === "north");
  assert.ok(hit, "no se pudo seleccionar el muro norte con clics");
  assert.equal(await h.page.textContent("#cmd-prefix"), "Dormitorio · muro norte ›");
});

test("orden sobre un muro: puerta a una distancia de la pared izquierda", async ({ h, app }) => {
  await h.pick("Muro norte", 0);
  const msg = await h.say("pon una puerta de 80 x 205 a 20 cm de la pared izquierda");
  assert.match(msg, /Puerta de 800 x 2050 mm.*a 200 mm de la izquierda/);
  assert.deepEqual(await h.selection(), { kind: "opening", roomId: "dormitorio", openingId: "door-north" });
  const door = app.readWorld().rooms[0].openings.find((o) => o.id === "door-north");
  assert.deepEqual({ offset: door.offset, width: door.width, height: door.height }, { offset: 200, width: 800, height: 2050 });
  assert.match(await h.say("muévela 30 cm a la derecha"), /a 500 mm de la izquierda/);
  assert.match(await h.say("quítala"), /quitada/);
  assert.equal(app.readWorld().rooms[0].openings.some((o) => o.id === "door-north"), false);
});

test("orden sobre un mueble cambia medidas y el precio", async ({ h }) => {
  const before = await h.page.textContent("#price-total");
  await h.pick("Armario", 0);
  assert.match(await h.say("agrega una repisa"), /4 repisa/);
  assert.match(await h.say("ensancha 10 cm"), /ancho 900 mm \(antes 800\)/);
  await h.page.waitForTimeout(300);
  assert.notEqual(await h.page.textContent("#price-total"), before);
});

test("lo que no cabe no cambia nada; lo que no se entiende ofrece pasarlo a la IA", async ({ h, app }) => {
  await h.pick("Biblioteca");
  const offset = app.readWorld().items.find((i) => i.id === "biblioteca").offset;
  assert.match(await h.say("muévelo 5 m a la derecha"), /No cabe/);
  assert.equal(app.readWorld().items.find((i) => i.id === "biblioteca").offset, offset);
  assert.match(await h.say("píntalo de azul petróleo"), /No entendí/);
  assert.equal(await h.page.locator("#copy-ai").count(), 1);
});

test("deshacer restaura el estado anterior", async ({ h, app }) => {
  await h.pick("Biblioteca");
  await h.say("quítalo");
  assert.equal(app.readWorld().items.some((i) => i.id === "biblioteca"), false);
  await h.page.click("#undo");
  await h.page.waitForTimeout(300);
  assert.equal(app.readWorld().items.some((i) => i.id === "biblioteca"), true);
});

test("un cambio externo al archivo (la IA por MCP) aparece solo", async ({ h, app }) => {
  const w = app.readWorld();
  w.items.push({ id: "estante-ia", name: "Estante IA", roomId: "cocina", kind: "cabinet", params: { width: 600, height: 900, depth: 300, shelves: 2 }, wall: "east", offset: 500, elevation: 0 });
  app.writeWorld(w);
  await h.page.waitForFunction("window.__handy.getWorld().items.some(i => i.id === 'estante-ia')", null, { timeout: 8000 });
  assert.equal(await h.page.locator(".node", { hasText: "Estante IA" }).count(), 1);
});

test("habitaciones contiguas: comparten muro y la puerta entre ellas se ve desde las dos", async ({ h, app }) => {
  await h.page.evaluate("window.__handy.select({ kind: 'world' })");
  assert.match(await h.say("baño de 1,5 x 2,2 al sur de la cocina"), /Baño: 1500 x 2200 x 2400 mm, al sur de Cocina, compartiendo su muro sur/);
  const bano = () => app.readWorld().rooms.find((r) => r.id === "bano");
  assert.equal(bano().wallThickness.north, 0);
  assert.equal(await h.page.locator(".node", { hasText: "Muro norte · con Cocina" }).count(), 1);
  // La vista se reencuadra sola: el baño nuevo queda dentro de la pantalla.
  await h.page.evaluate("window.__handy.select({ kind: 'room', roomId: 'bano' })");
  const labels = await h.page.locator("#dims .dim").evaluateAll((els) => els.filter((e) => e.style.display !== "none").length);
  assert.ok(labels >= 2, "las cotas del baño deberían verse en pantalla");
  await h.pick("Muro norte · con Cocina");
  assert.match(await h.page.textContent("#props"), /Compartido conCocina/);
  assert.match(await h.say("puerta de 70 x 205 a 30 cm de la derecha"), /Puerta de 700 x 2050 mm en el muro norte, a 500 mm de la izquierda/);
  assert.equal(bano().openings.length, 1);
  // Desde la cocina, el mismo muro pierde ese tramo: antes ofrecía de 0 a 1.800 y ahora la puerta empieza en 1.600.
  await h.pick("Muro sur · con Baño");
  assert.match(await h.page.textContent("#props"), /Tramos libres0–1\.600/);
});

test("sin nada seleccionado se crea una habitación", async ({ h }) => {
  await h.page.evaluate("window.__handy.select({ kind: 'world' })");
  assert.match(await h.say("estudio de 3 x 2,5 m"), /Estudio: 3000 x 2500/);
  assert.equal((await h.world()).rooms.length, 3);
});

test("exporta a Blender un glTF válido en estructura", async ({ h }) => {
  const [download] = await Promise.all([h.page.waitForEvent("download"), h.page.click("#export-gltf")]);
  const gltf = JSON.parse(readFileSync(await download.path(), "utf8"));
  assert.equal(gltf.asset.version, "2.0");
  assert.ok(gltf.nodes.some((n) => n.name === "Dormitorio"));
});

test("closet con divisiones, barra y cajones desde una frase, y se edita por partes", async ({ h, app }) => {
  await h.pick("Muro sur", 0);
  const msg = await h.say("closet de 180 x 220 x 60 con 2 divisiones, barra y 3 cajones, pegado a la derecha");
  assert.match(msg, /Closet de 1800 x 2200 x 600 mm/);
  const closet = () => app.readWorld().items.find((i) => i.id === "closet");
  assert.deepEqual({ dividers: closet().params.dividers, drawers: closet().params.drawers, bar: closet().params.hangingBar }, { dividers: 2, drawers: 3, bar: true });
  const props = await h.page.textContent("#props");
  assert.match(props, /Divisiones2 · 3 cuerpos/);
  assert.match(props, /Cajones3 de 200 mm/);
  assert.match(await h.say("agrega un cajón"), /4 cajón/);
  assert.match(await h.say("quita la barra"), /sin barra/);
  assert.ok(closet(), "quitar la barra no debe borrar el mueble");
  assert.match(await h.say("3 puertas"), /2 por cuerpo/);
  assert.match(await h.say("6 puertas"), /6 puerta/);
});

test("estructura de tubo: mesa con barras, peso y precio; se edita y entra al despiece", async ({ h, app }) => {
  await h.pick("Muro sur", 1);
  const msg = await h.say("mesa de tubo de 120 x 75 x 60 pegada a la izquierda");
  assert.match(msg, /Mesa de tubo de 1200 x 750 x 600 mm en tubo-40x40x1\.5, \d+,\d kg de acero/);
  const item = () => app.readWorld().items.find((i) => i.id === "mesa-de-tubo");
  assert.equal(item().kind, "frame");
  const props = await h.page.textContent("#props");
  assert.match(props, /Barras de 6 m2 · sobra \d+ %/);
  assert.match(props, /Uniones16 · soldadas/);
  assert.match(await h.say("tubo de 50"), /tubo-50x50x2/);
  assert.match(await h.say("agrega un cajón"), /estructura de tubo/);
  assert.equal(item().frame.profileId, "tubo-50x50x2");
  const [download] = await Promise.all([h.page.waitForEvent("download"), h.page.click("#export-cut")]);
  const html = readFileSync(await download.path(), "utf8");
  assert.match(html, /Perfiles metálicos/);
  assert.match(html, /Mesa de tubo · Pata/);
});

test("orden sobre una habitación: piso con cajas, pega y boquilla, sumado al precio", async ({ h, app }) => {
  const before = await h.page.textContent("#price-total");
  await h.pick("Cocina");
  const msg = await h.say("piso de porcelanato 60 x 60");
  assert.match(msg, /porcelanato 600 x 600 mm.*Necesitas \d+ piezas.*pega flexible para porcelanato.*boquilla/);
  assert.equal(app.readWorld().rooms[1].floor.tileWidth, 600);
  await h.page.waitForTimeout(300);
  assert.notEqual(await h.page.textContent("#price-total"), before);
  const props = await h.page.textContent("#props");
  assert.match(props, /Comprar\d+ piezas/);
  assert.match(props, /Cajas\d+ de 4 piezas/); // la presentación de la tienda, igual que en el precio
  assert.match(props, /Boquilla/);
  assert.match(await h.page.textContent("#price-sub"), /1 piso/);
  assert.match(await h.say("trabado a un tercio"), /trabado/);
  assert.match(await h.say("quita el piso"), /sin piso/);
  assert.equal(app.readWorld().rooms[1].floor, undefined);
});

test("cotas: al seleccionar un mueble aparecen su ancho, su alto y los espacios a cada lado", async ({ h }) => {
  await h.pick("Biblioteca");
  const labels = await h.page.evaluate("window.__handy.dimLabels()");
  // Biblioteca de 900 x 1800 en el muro oeste (3200), de 400 a 1300.
  assert.deepEqual(labels, ["400", "900", "1.900", "1.800"]);
  await h.pick("Muro norte", 0);
  assert.deepEqual(await h.page.evaluate("window.__handy.dimLabels()"), ["3.600", "2.400"]);
});

test("arrastrar un mueble seleccionado lo mueve por su muro, se guarda y se deshace", async ({ h, app }) => {
  const offset = () => app.readWorld().items.find((i) => i.id === "biblioteca").offset;
  await h.pick("Biblioteca");
  const start = offset();
  const p = await h.page.evaluate("window.__handy.selectionScreen()");
  await h.page.mouse.move(p.x, p.y);
  await h.page.mouse.down();
  for (let i = 1; i <= 8; i++) await h.page.mouse.move(p.x + i * 12, p.y - i * 5);
  await h.page.mouse.up();
  await h.page.waitForTimeout(400);
  const moved = offset();
  assert.notEqual(moved, start, "el mueble no se movió");
  assert.equal(moved % 10, 0, "la posición debe quedar en la rejilla de 10 mm");
  assert.match(await h.page.textContent("#toast"), /Biblioteca: de [\d.]+ a [\d.]+ mm en el muro oeste/);
  assert.equal((await h.page.evaluate("window.__handy.dimLabels()"))[0], moved.toLocaleString("es-CO"));
  await h.page.click("#undo");
  await h.page.waitForTimeout(300);
  assert.equal(offset(), start);
});

test("un clic sin arrastrar no mueve nada, y arrastrar lo no seleccionado gira la vista", async ({ h, app }) => {
  const before = JSON.stringify(app.readWorld().items);
  await h.pick("Biblioteca");
  const p = await h.page.evaluate("window.__handy.selectionScreen()");
  await h.page.mouse.click(p.x, p.y);
  await h.page.evaluate("window.__handy.select({ kind: 'world' })");
  await h.page.mouse.move(p.x, p.y);
  await h.page.mouse.down();
  for (let i = 1; i <= 6; i++) await h.page.mouse.move(p.x + i * 15, p.y);
  await h.page.mouse.up();
  await h.page.waitForTimeout(300);
  assert.equal(JSON.stringify(app.readWorld().items), before);
});

test("las manijas cambian ancho y alto; lo que no cabe se queda en la última medida válida", async ({ h, app }) => {
  const params = () => app.readWorld().items.find((i) => i.id === "biblioteca").params;
  await h.pick("Biblioteca");
  const w0 = params().width, h0 = params().height;
  let p = await h.page.evaluate("window.__handy.handleScreen('width')");
  await h.page.mouse.move(p.x, p.y);
  await h.page.mouse.down();
  for (let i = 1; i <= 8; i++) await h.page.mouse.move(p.x + i * 8, p.y - i * 3);
  await h.page.mouse.up();
  await h.page.waitForTimeout(400);
  assert.notEqual(params().width, w0, "el ancho no cambió");
  assert.match(await h.page.textContent("#toast"), /Biblioteca: ancho [\d.]+ mm/);
  p = await h.page.evaluate("window.__handy.handleScreen('height')");
  await h.page.mouse.move(p.x, p.y);
  await h.page.mouse.down();
  for (let i = 1; i <= 30; i++) await h.page.mouse.move(p.x, p.y - i * 15);
  await h.page.mouse.up();
  await h.page.waitForTimeout(400);
  assert.ok(params().height > h0, "el alto no creció");
  assert.ok(params().height <= 2400, "el mueble no puede pasar del techo");
});

test("flechas mueven 10 mm y con Mayús 100; Esc cancela un arrastre", async ({ h, app }) => {
  const offset = () => app.readWorld().items.find((i) => i.id === "biblioteca").offset;
  await h.pick("Biblioteca");
  const start = offset();
  await h.page.keyboard.press("ArrowRight");
  await h.page.waitForTimeout(250);
  assert.equal(offset(), start + 10);
  await h.page.keyboard.press("Shift+ArrowLeft");
  await h.page.waitForTimeout(250);
  assert.equal(offset(), start - 90);
  const p = await h.page.evaluate("window.__handy.selectionScreen()");
  await h.page.mouse.move(p.x, p.y);
  await h.page.mouse.down();
  for (let i = 1; i <= 6; i++) await h.page.mouse.move(p.x + i * 12, p.y - i * 5);
  await h.page.keyboard.press("Escape");
  await h.page.mouse.up();
  await h.page.waitForTimeout(300);
  assert.equal(offset(), start - 90);
});

test("mueble suelto: se pide con la habitación seleccionada, se aleja, se gira y se arrastra hacia adentro", async ({ h }) => {
  const rooms = (await h.world()).rooms;
  // La habitación más grande, para que haya dónde ponerlo.
  const room = rooms.slice().sort((a, b) => b.width * b.depth - a.width * a.depth)[0];
  await h.page.evaluate((id) => window.__handy.select({ kind: "room", roomId: id }), room.id);
  const made = await h.say("mesa de tubo de 100 x 75 x 60");
  assert.match(made, /a \d+ mm del muro norte de .* y a \d+ mm de su izquierda, mirando al sur/);
  const sel = await h.selection();
  assert.equal(sel.kind, "item");
  const item = async () => (await h.world()).items.find((i) => i.id === sel.itemId);
  const start = await item();
  assert.equal(start.gap, Math.round((room.depth - 600) / 2));
  assert.equal(start.offset, Math.round((room.width - 1000) / 2));
  assert.match(await h.page.textContent("#props"), /Separado del muro/);
  // Cotas: además del ancho y los lados, la distancia a su muro y al de enfrente.
  assert.ok((await h.page.locator(".dim").count()) >= 5);

  // Teclado: arriba y abajo lo alejan y lo acercan; R lo gira sin moverlo de sitio.
  await h.page.locator("#view canvas").focus().catch(() => {});
  await h.page.keyboard.press("ArrowUp");
  await h.page.waitForFunction((g) => window.__handy.getWorld().items.some((i) => i.gap === g), start.gap + 10);
  await h.page.keyboard.press("Shift+ArrowDown");
  await h.page.waitForFunction((g) => window.__handy.getWorld().items.some((i) => i.gap === g), start.gap - 90);
  await h.page.keyboard.press("r");
  await h.page.waitForFunction((id) => window.__handy.getWorld().items.find((i) => i.id === id).wall === "east", sel.itemId);
  await h.page.keyboard.press("r"); await h.page.keyboard.press("r"); await h.page.keyboard.press("r");
  await h.page.waitForFunction((id) => window.__handy.getWorld().items.find((i) => i.id === id).wall === "north", sel.itemId);

  // Arrastrar hacia adentro del cuarto lo aleja del muro. La dirección en pantalla se mide moviéndolo con una orden.
  const screen = () => h.page.evaluate(() => window.__handy.selectionScreen());
  const p0 = await screen();
  await h.say("aléjalo 30 cm");
  const p1 = await screen();
  await h.say("acércalo 30 cm");
  const before = (await item()).gap;
  const a = p0, dx = p1.x - p0.x, dy = p1.y - p0.y;
  assert.ok(Math.hypot(dx, dy) > 4, "alejar el mueble debe moverlo en pantalla");
  await h.page.mouse.move(a.x, a.y);
  await h.page.mouse.down();
  for (let i = 1; i <= 8; i++) await h.page.mouse.move(a.x + (dx * i) / 8, a.y + (dy * i) / 8);
  await h.page.mouse.up();
  await h.page.waitForTimeout(300);
  const after = (await item()).gap;
  assert.ok(after - before > 120 && after - before < 600, `arrastrar hacia adentro debía alejarlo unos 300 mm y cambió ${after - before}`);

  // Con palabras: pegarlo al muro, pasarlo a otro, y lo que no cabe no cambia nada.
  assert.match(await h.say("pégalo al muro"), /pegado al muro norte/);
  assert.equal((await item()).gap, undefined);
  assert.match(await h.say("pásalo al muro sur"), /contra el muro sur/);
  assert.match(await h.say("sepáralo 20 m"), /No cabe/);
  assert.equal((await item()).wall, "south");
  await h.say("quítalo");
  assert.equal((await h.world()).items.some((i) => i.id === sel.itemId), false);
});

test("habitación en L y columnas: se crean con palabras, se seleccionan en 3D, se mueven y estorban a los muebles", async ({ h }) => {
  await h.page.evaluate(() => window.__handy.select({ kind: "world" }));
  assert.match(await h.say("bodega de 5 x 4 m"), /Bodega/);
  const room = (await h.world()).rooms.find((r) => r.name === "Bodega");
  const selRoom = () => h.page.evaluate((id) => window.__handy.select({ kind: "room", roomId: id }), room.id);
  const blocks = async () => (await h.world()).rooms.find((r) => r.id === room.id).blocks ?? [];

  // Cerrar una esquina la vuelve una L: el piso libre baja de 20 a 17 m².
  await selRoom();
  assert.match(await h.say("recorta la esquina noreste 2 x 1,5 m"), /Esquina cerrada de 2000 x 1500 mm, hasta el techo.* queda con 17,0 m² de piso/);
  assert.deepEqual(await h.selection(), { kind: "block", roomId: room.id, blockId: "esquina-cerrada" });
  assert.match(await h.page.textContent("#props"), /Al muro sur/);
  assert.equal(await h.page.locator(".node", { hasText: "Esquina cerrada" }).count(), 1);
  await selRoom();
  assert.match(await h.page.textContent("#props"), /Piso libre\s*17,0 m²/);

  // Una columna, puesta por distancias a dos muros; las flechas la mueven por puntos cardinales.
  assert.match(await h.say("columna de 30 x 30 a 2 m del muro oeste y 2 m del muro norte"), /Columna de 300 x 300 mm/);
  assert.equal((await h.selection()).blockId, "columna");
  assert.ok((await h.page.locator(".dim").count()) >= 6);
  await h.page.keyboard.press("ArrowRight");
  await h.page.keyboard.press("Shift+ArrowDown");
  await h.page.waitForFunction((id) => { const b = window.__handy.getWorld().rooms.find((r) => r.id === id).blocks.find((x) => x.id === "columna"); return b.x === 2010 && b.z === 2100; }, room.id);
  assert.match(await h.say("muévela 9 m al este"), /No cabe/);

  // Se puede seleccionar con un clic en la vista 3D.
  await h.page.click("#frame");
  await h.page.waitForTimeout(400);
  await h.page.evaluate(() => window.__handy.select({ kind: "world" }));
  assert.ok(await h.clickUntil((s) => s.kind === "block"), "ningún clic en la vista dio con una columna o esquina");

  // Un mueble que se mete en la esquina cerrada se avisa; el piso descuenta lo que no es piso.
  await h.page.evaluate((id) => window.__handy.select({ kind: "wall", roomId: id, wall: "north" }), room.id);
  assert.match(await h.say("armario de 80 x 200 x 50 a 2,6 m de la izquierda"), /Armario de 800/);
  const item = await h.selection();
  await h.page.waitForFunction(() => /se mete en Esquina cerrada/.test(document.getElementById("issues").textContent + document.getElementById("props").textContent));
  await h.say("quítalo");
  await selRoom();
  const floor = await h.say("piso de porcelanato 50 x 50");
  assert.match(floor, /Necesitas \d+ piezas/);
  const area = await h.page.evaluate((id) => { const w = window.__handy.getWorld(); const r = w.rooms.find((x) => x.id === id); return r.width * r.depth - r.blocks.reduce((a, b) => a + b.width * b.depth, 0); }, room.id);
  assert.equal(area, 5000 * 4000 - 2000 * 1500 - 300 * 300);
  await h.say("quita el piso");

  // Quitar la columna devuelve la selección a la habitación.
  // Se escoge en la lista lateral: con el cursor en la barra de órdenes, Supr borra texto y no la columna.
  await h.pick("Columna");
  assert.equal((await h.selection()).blockId, "columna");
  await h.page.keyboard.press("Delete");
  await h.page.waitForFunction((id) => window.__handy.getWorld().rooms.find((r) => r.id === id).blocks.length === 1, room.id);
  assert.equal((await h.selection()).kind, "room");
  assert.equal((await blocks()).length, 1);
  assert.ok(item.itemId);
});

test("electricidad: tomas, interruptores y luces con palabras, franjas de no perforar, avisos y costo", async ({ h }) => {
  await h.page.evaluate(() => window.__handy.select({ kind: "world" }));
  assert.match(await h.say("estudio de 4 x 3 m"), /Estudio/);
  const room = (await h.world()).rooms.find((r) => r.name === "Estudio");
  const sel = (s) => h.page.evaluate((x) => window.__handy.select(x), s);
  const points = async () => (await h.world()).rooms.find((r) => r.id === room.id).points ?? [];

  // Una toma en un muro: sale a 300 mm del piso, queda seleccionada y aparece su franja.
  await sel({ kind: "wall", roomId: room.id, wall: "north" });
  assert.equal(await h.say("toma a 1 m de la izquierda"), "Toma en el muro norte, a 1000 mm de la izquierda y 300 mm del piso.");
  assert.deepEqual(await h.selection(), { kind: "point", roomId: room.id, pointId: "toma" });
  assert.equal(await h.page.evaluate(() => window.__handy.bands()), 1);
  assert.match(await h.page.textContent("#props"), /Del piso\s*300 mm/);
  assert.match(await h.page.textContent("#props"), /suele subir o bajar la tubería/);
  await h.page.keyboard.press("ArrowUp");
  await h.page.keyboard.press("Shift+ArrowRight");
  await h.page.waitForFunction((id) => { const p = window.__handy.getWorld().rooms.find((r) => r.id === id).points[0]; return p.height === 310 && p.offset === 1100; }, room.id);

  // Luces y tomas repartidas, con la habitación seleccionada.
  await sel({ kind: "room", roomId: room.id });
  assert.match(await h.say("2 luces"), /2 luces en el techo de Estudio/);
  await sel({ kind: "room", roomId: room.id });
  assert.match(await h.say("reparte las tomas"), /toma\(s\) repartidas en Estudio a 300 mm del piso/);
  const all = await points();
  assert.equal(all.filter((p) => p.kind === "light").length, 2);
  assert.ok(all.filter((p) => p.kind === "outlet").length >= 4);
  assert.ok((await h.page.evaluate(() => window.__handy.bands())) >= 4);
  await h.page.waitForFunction(() => /punto\(s\) de instalación/.test(document.getElementById("price-sub").textContent));
  await h.page.hover("#price");
  await h.page.waitForFunction(() => /Eléctrico/.test(document.getElementById("price-pop").textContent));
  assert.match(await h.page.textContent("#price-pop"), /Estudio · Tubería conduit/);
  await h.page.mouse.move(5, 300);

  // Un mueble colgado sobre la vertical de la toma: aviso de no perforar ahí.
  await sel({ kind: "wall", roomId: room.id, wall: "north" });
  assert.match(await h.say("alacena de 80 x 70 x 30 a 70 cm de la izquierda a 1,5 m del piso"), /Alacena de 800/);
  await h.page.waitForFunction(() => /suele pasar la tubería/.test(document.getElementById("props").textContent + document.getElementById("issues").textContent));
  await h.say("quítalo");

  // Los puntos se seleccionan con un clic en la vista y aparecen en la lista bajo su muro.
  await h.page.click("#frame");
  await h.page.waitForTimeout(400);
  await sel({ kind: "world" });
  // Se escoge una toma del muro que queda al fondo de la vista, para que nada la tape.
  const visible = (await points()).find((p) => p.kind === "outlet" && p.wall === "north");
  const at = await h.page.evaluate(([r, id]) => window.__handy.pointScreen(r, id), [room.id, visible.id]);
  await h.page.mouse.click(at.x, at.y);
  assert.deepEqual(await h.selection(), { kind: "point", roomId: room.id, pointId: visible.id });
  assert.ok((await h.page.locator(".node", { hasText: "Toma" }).count()) >= 4);

  // Se quitan uno por uno; sin puntos, el presupuesto vuelve a no tener grupo eléctrico.
  for (const p of await points()) { await sel({ kind: "point", roomId: room.id, pointId: p.id }); await h.say("quítala"); }
  assert.equal((await points()).length, 0);
  await h.page.waitForFunction(() => window.__handy.getQuote() && window.__handy.getQuote().groups.electrical === 0);
});

test("sol: pide el lugar, pinta dónde entra por las ventanas y cambia con la hora, la fecha y la orientación", async ({ h }) => {
  const sun = () => h.page.evaluate(() => window.__handy.sun());
  await h.page.evaluate(() => window.__handy.select({ kind: "world" }));
  // Sin lugar no hay sol: lo pide.
  await h.page.click("#sun-toggle");
  await h.page.waitForFunction(() => /dime dónde está la casa/.test(document.getElementById("toast").textContent));
  assert.equal((await sun()).view, null);
  assert.match(await h.say("estamos en Bogotá"), /Lugar: Bogotá/);
  assert.equal((await h.world()).site.place, "Bogotá");

  // Una ventana al este en una habitación nueva y sola: a las 8 de la mañana le entra sol; a las 4 de la tarde no.
  assert.match(await h.say("solar de 4 x 3 m"), /Solar/);
  const room = (await h.world()).rooms.find((r) => r.name === "Solar");
  const others = (await h.world()).rooms.filter((r) => r.id !== room.id).flatMap((r) => r.openings.filter((o) => o.type === "window")).length;
  await h.page.evaluate((id) => window.__handy.select({ kind: "wall", roomId: id, wall: "east" }), room.id);
  assert.match(await h.say("ventana de 120 x 100 centrada, antepecho 100"), /Ventana de 1200 x 1000/);
  assert.match(await h.say("sol el 21 de marzo a las 8 de la mañana"), /Sol a \d+° de altura, viene del este/);
  let s = await sun();
  assert.deepEqual([s.view.date.slice(5), s.view.minutes], ["03-21", 480]);
  assert.ok(s.patches >= 1, "a las 8 debía entrar sol por la ventana del este");
  assert.equal(await h.page.locator("#sunbar").isVisible(), true);
  assert.match(await h.page.textContent("#sun-label"), /Bogotá · 21 mar · 8:00 a\. m\./);
  const morning = s.patches;

  // El control de hora mueve el sol: a las 4 de la tarde esa ventana ya no recibe.
  await h.page.fill("#sun-time", "960");
  s = await sun();
  assert.equal(s.view.minutes, 960);
  assert.ok(s.patches <= morning - 1 + others, "la ventana del este no debía recibir sol en la tarde");
  // Girar la casa media vuelta deja esa ventana mirando al oeste: ahora recibe el sol de la tarde.
  assert.match(await h.say("el muro norte mira al sur"), /mira al sur \(180°\)/);
  s = await sun();
  assert.ok(s.patches >= 1);
  await h.page.evaluate((id) => window.__handy.select({ kind: "room", roomId: id }), room.id);
  assert.match(await h.page.textContent("#props"), /Sol · ventana oeste\s*jun \d+(,\d)? h · mar \d+(,\d)? h · dic \d+(,\d)? h/);

  // Fechas de referencia, noche y apagado.
  await h.page.click('[data-sun-date="12-21"]');
  assert.equal((await sun()).view.date.slice(5), "12-21");
  assert.match(await h.say("sol a las 11 de la noche"), /Es de noche a esa hora/);
  assert.equal((await sun()).patches, 0);
  await h.say("quita el sol");
  assert.equal((await sun()).view, null);
  assert.equal(await h.page.locator("#sunbar").isVisible(), false);
  await h.say("el muro norte mira al norte");
});

test("cubierta y esquinas redondeadas: se piden con palabras, se dibujan curvas y el despiece trae la plantilla", async ({ h }) => {
  await h.page.evaluate(() => window.__handy.select({ kind: "world" }));
  assert.match(await h.say("comedor de 5 x 4 m"), /Comedor/);
  const room = (await h.world()).rooms.find((r) => r.name === "Comedor");
  const selRoom = () => h.page.evaluate((id) => window.__handy.select({ kind: "room", roomId: id }), room.id);
  const rounded = () => h.page.evaluate(() => window.__handy.rounded());

  // Una isla suelta con esquinas redondeadas: lleva cubierta y se redondean las cuatro.
  await selRoom();
  assert.match(await h.say("isla de 180 x 90 x 60 con 4 cajones y esquinas redondeadas"), /Isla de 1800 x 900 x 600 mm/);
  const isla = await h.selection();
  const params = async () => (await h.world()).items.find((i) => i.id === isla.itemId).params;
  assert.deepEqual((await params()).countertop, { cornerRadius: 50, roundAll: true });
  let r = await rounded();
  assert.equal(r.length, 1);
  assert.equal(r[0].radius, 50);
  // Una pieza curva tiene muchos más vértices que una caja.
  assert.ok(r[0].vertices > 100, `la cubierta debía dibujarse curva y tiene ${r[0].vertices} vértices`);

  assert.match(await h.say("radio 10 cm"), /las 4 esquinas redondeadas a R100 mm\. El despiece trae la plantilla/);
  assert.equal((await rounded())[0].radius, 100);
  assert.match(await h.say("radio 2 m"), /no cabe/);
  assert.equal((await params()).countertop.cornerRadius, 100);
  assert.match(await h.say("esquinas rectas"), /con esquinas rectas/);
  assert.equal((await rounded()).length, 0);
  assert.match(await h.say("esquinas redondeadas 6 cm"), /R60 mm/);

  // El despiece la pide rectangular y trae la plantilla a tamaño real.
  const [download] = await Promise.all([h.page.waitForEvent("download"), h.page.click("#export-cut")]);
  const html = readFileSync(await download.path(), "utf8");
  assert.match(html, /Isla · Cubierta<\/strong>|<strong>Isla · Cubierta|Cubierta<\/strong>: las 4 esquinas a R60 mm/);
  assert.match(html, /Plantilla R60 mm, tamaño real/);
  const doc = await h.page.context().newPage();
  await doc.setContent(html);
  const size = await doc.evaluate(() => { const svg = [...document.querySelectorAll("svg")].at(-1); return [svg.getAttribute("width"), svg.getAttribute("height")]; });
  assert.match(size[0], /^\d+mm$/);
  await doc.close();

  // Una mesa de tubo también: su cubierta sale con las cuatro esquinas curvas.
  await selRoom();
  assert.match(await h.say("mesa de tubo de 140 x 75 x 70 con esquinas redondeadas contra el muro sur"), /Mesa de tubo de 1400/);
  const mesa = await h.selection();
  assert.equal((await rounded()).length, 2);
  await h.say("quítalo");
  await h.page.evaluate((id) => window.__handy.select({ kind: "item", itemId: id }), isla.itemId);
  await h.say("quítalo");
  assert.equal((await rounded()).length, 0);
  assert.ok(mesa.itemId);
});

test("agua, desagüe y gas: el punto de un aparato, el aviso de cajones contra el sifón y su costo aparte", async ({ h }) => {
  await h.page.evaluate(() => window.__handy.select({ kind: "world" }));
  assert.match(await h.say("taller de 4 x 3 m"), /Taller/);
  const room = (await h.world()).rooms.find((r) => r.name === "Taller");
  const sel = (s) => h.page.evaluate((x) => window.__handy.select(x), s);
  const north = { kind: "wall", roomId: room.id, wall: "north" };
  const points = async () => (await h.world()).rooms.find((r) => r.id === room.id).points ?? [];
  const warnings = () => h.page.evaluate(() => document.getElementById("props").textContent + document.getElementById("issues").textContent);

  // El punto de lavaplatos trae agua y desagüe a sus alturas, y cada uno su franja de no perforar.
  await sel(north);
  assert.match(await h.say("punto de lavaplatos a 1,5 m de la izquierda"), /Lavaplatos en el muro norte, con eje a 1500 mm de la izquierda: agua · lavaplatos a 1400 mm de la izquierda y 550 mm del piso; desagüe · lavaplatos a 1500 mm de la izquierda y 500 mm del piso/);
  assert.deepEqual((await points()).map((p) => [p.kind, p.height]), [["water", 550], ["drain", 500]]);
  assert.equal(await h.page.evaluate(() => window.__handy.bands()), 2);
  assert.match(await h.page.textContent("#props"), /Tipo\s*desagüe/);

  // Una cajonera delante choca con el sifón; un gabinete de puertas no.
  await sel(north);
  assert.match(await h.say("cajonera de 80 x 90 x 60 a 1,1 m de la izquierda"), /Cajonera de 800/);
  await h.page.waitForFunction(() => /chocan con el sifón/.test(document.getElementById("props").textContent + document.getElementById("issues").textContent));
  await h.say("quítalo");
  await sel(north);
  assert.match(await h.say("gabinete de 80 x 90 x 60 con 2 puertas a 1,1 m de la izquierda"), /Gabinete de 800/);
  await h.page.waitForTimeout(300);
  assert.doesNotMatch(await warnings(), /sifón/);
  const cabinet = await h.selection();

  // Punto de gas, y el presupuesto con su grupo aparte.
  await sel(north);
  assert.match(await h.say("punto de gas a 50 cm de la derecha"), /punto de gas a 3500 mm de la izquierda y 700 mm del piso/);
  await h.page.waitForFunction(() => /punto\(s\) de instalación/.test(document.getElementById("price-sub").textContent));
  await h.page.hover("#price");
  await h.page.waitForFunction(() => /Agua y gas/.test(document.getElementById("price-pop").textContent));
  assert.match(await h.page.textContent("#price-pop"), /Taller · Sifón y desagüe/);
  await h.page.mouse.move(5, 300);
  // Con la habitación seleccionada, pide un muro.
  await sel({ kind: "room", roomId: room.id });
  assert.match(await h.say("punto de lavadora"), /haz clic en el muro/);

  for (const p of await points()) { await sel({ kind: "point", roomId: room.id, pointId: p.id }); await h.say("quítala"); }
  await sel(cabinet); await h.say("quítalo");
  assert.equal((await points()).length, 0);
});

test("cocina por módulos: se pide sobre un muro y sale acomodada al lavaplatos y a la estufa, con mesón corrido", async ({ h }) => {
  await h.page.evaluate(() => window.__handy.select({ kind: "world" }));
  assert.match(await h.say("cocineta de 4 x 3 m"), /Cocineta/);
  const room = (await h.world()).rooms.find((r) => r.name === "Cocineta");
  const sel = (s) => h.page.evaluate((x) => window.__handy.select(x), s);
  const north = { kind: "wall", roomId: room.id, wall: "north" };
  const mine = async () => (await h.world()).items.filter((i) => i.roomId === room.id);
  await sel(north); await h.say("punto de lavaplatos a 1,2 m de la izquierda");
  await sel(north); await h.say("punto de gas a 1,1 m de la derecha");

  await sel(north);
  const said = await h.say("cocina");
  assert.match(said, /Cocina de 4000 mm en el muro norte, desde 0 mm de la izquierda: 6 bajo\(s\) con mesón corrido y \d+ alto\(s\)/);
  assert.match(said, /Bajos: Bajo 1 800 · Bajo lavaplatos 800 · Bajo 2 500 · Cajonera de cocina 500 · Bajo estufa 600 · Bajo 3 800/);
  const items = await mine();
  const bases = items.filter((i) => i.elevation === 0).sort((a, b) => a.offset - b.offset);
  assert.equal(bases.length, 6);
  assert.deepEqual(bases.map((b) => !!b.params.countertop), [true, false, false, false, false, false]);
  assert.equal(bases[0].params.countertop.span, 4000);
  assert.ok(items.some((i) => i.elevation === 1500));
  // Queda seleccionado el primer módulo, listo para ajustar; cada uno aparece en la lista.
  assert.equal((await h.selection()).itemId, bases[0].id);
  assert.equal(await h.page.locator(".node", { hasText: "Bajo lavaplatos" }).count(), 1);
  // Ningún aviso de cajones contra el sifón ni de gas encerrado.
  await sel({ kind: "room", roomId: room.id });
  await h.page.waitForTimeout(300);
  assert.doesNotMatch(await h.page.textContent("#props"), /sifón|queda dentro de/);

  // Deshacer quita la cocina entera de un golpe.
  await h.page.click("#undo");
  await h.page.waitForFunction((id) => window.__handy.getWorld().items.filter((i) => i.roomId === id).length === 0, room.id);
  for (const p of (await h.world()).rooms.find((r) => r.id === room.id).points ?? []) { await sel({ kind: "point", roomId: room.id, pointId: p.id }); await h.say("quítala"); }
});

test("armado paso a paso en 3D: niveles de detalle, piezas que entran, puntos de herraje y manual imprimible", async ({ h }) => {
  // Con varios muebles y nada seleccionado, pide escoger uno.
  await h.page.keyboard.press("Escape");
  await h.page.evaluate(() => window.__handy.select({ kind: "world" }));
  if ((await h.world()).items.length > 1) {
    await h.page.click("#export-assembly");
    await h.page.waitForFunction(() => /Haz clic en un mueble/.test(document.getElementById("toast").textContent));
  }
  const item = (await h.world()).items.find((i) => i.kind !== "frame");
  await h.page.evaluate((id) => window.__handy.select({ kind: "item", itemId: id }), item.id);
  await h.page.click("#export-assembly");
  await h.page.waitForSelector("#asm canvas");
  const st = () => h.page.evaluate(() => window.__handy.assembly().state());
  const level = (id) => h.page.click(`.seg button[data-level="${id}"]`);

  // Guiado: empieza reconociendo piezas, con el mueble entero a la vista.
  await level("guided");
  let s = await st();
  assert.equal(s.level, "guided");
  assert.equal(s.title, "Reconoce las piezas y los herrajes");
  assert.ok(s.visible >= 6 && s.fresh.length === 0);
  const guidedSteps = s.steps;
  assert.equal(await h.page.locator("#asm-steps button").count(), guidedSteps);

  // Siguiente: el piso llega al costado acostado, con sus tres herrajes señalados y las acciones con medidas.
  await h.page.click("#asm-next");
  s = await st();
  assert.deepEqual([s.step, s.fresh, s.lying, s.points], [1, ["side-left", "bottom"], true, 3]);
  assert.ok(s.actions >= 4);
  const info = await h.page.textContent("#asm-info");
  assert.match(info, /Paso 2 de \d+/);
  assert.match(info, /en el costado izquierdo \(A\), en la cara derecha, sobre la línea a \d+ mm desde abajo/);
  assert.match(info, /Antes de seguir/);
  assert.equal(await h.page.locator(".asm-tag").count(), 2);
  // La pieza llega animada y termina en su sitio.
  await h.page.waitForFunction(() => window.__handy.assembly().state().progress === 1, null, { timeout: 6000 });
  // El dibujo no está vacío: hay píxeles distintos al fondo.
  const painted = await h.page.evaluate(() => {
    const c = document.querySelector("#asm canvas"), probe = document.createElement("canvas");
    probe.width = 160; probe.height = 100;
    const g = probe.getContext("2d"); g.drawImage(c, 0, 0, 160, 100);
    const d = g.getImageData(0, 0, 160, 100).data; const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return seen.size;
  });
  assert.ok(painted > 3, `el lienzo del armado parece vacío (${painted} colores)`);

  // Teclado: flechas para avanzar y volver; las teclas no llegan al visor de atrás.
  const before = JSON.stringify(await h.world());
  await h.page.keyboard.press("ArrowRight");
  assert.equal((await st()).step, 2);
  await h.page.keyboard.press("ArrowLeft");
  assert.equal((await st()).step, 1);
  await h.page.keyboard.press("Delete");
  assert.equal(JSON.stringify(await h.world()), before);

  // Cambiar de nivel conserva el punto del armado; el experto resume en pocas fases sin acciones.
  await level("normal");
  s = await st();
  assert.ok(s.steps < guidedSteps);
  assert.ok(s.fresh.includes("bottom"));
  assert.equal(s.actions, 0);
  await level("expert");
  s = await st();
  assert.equal(s.title, "Arma la caja");
  assert.ok(s.steps <= 4);

  // El manual imprimible sale al nivel elegido y trae el plano de perforación.
  await level("guided");
  const [download] = await Promise.all([h.page.waitForEvent("download"), h.page.click("#asm-print")]);
  assert.match(download.suggestedFilename(), new RegExp(`-armado-${item.id}-guided\\.html$`));
  const html = readFileSync(await download.path(), "utf8");
  const doc = await h.page.context().newPage();
  await doc.setContent(html);
  assert.equal(await doc.locator("section.step").count(), guidedSteps);
  assert.ok((await doc.locator("ol.acts li").count()) > 20);
  assert.ok((await doc.locator("section.drill svg").count()) >= 4);
  assert.match(await doc.textContent("body"), /Plano de perforación/);
  assert.equal(await doc.locator("text=NaN").count(), 0);
  await doc.close();

  // Llegar al final cierra; Esc también. Y se abre pidiéndolo con palabras.
  await h.page.keyboard.press("Escape");
  await h.page.waitForSelector("#asm", { state: "detached" });
  assert.equal(await h.page.evaluate(() => window.__handy.assembly()), undefined);
  await h.page.fill("#cmd-input", "¿cómo se arma?");
  await h.page.keyboard.press("Enter");
  await h.page.waitForSelector("#asm canvas");
  await h.page.click("#asm-close");
  await h.page.waitForSelector("#asm", { state: "detached" });
});

test("el despiece descarga un documento con lista de piezas y plano de corte", async ({ h }) => {
  const [download] = await Promise.all([h.page.waitForEvent("download"), h.page.click("#export-cut")]);
  assert.match(download.suggestedFilename(), /-despiece\.html$/);
  const html = readFileSync(await download.path(), "utf8");
  assert.match(html, /tablero\(s\) de Melamina 18 mm Blanco/);
  assert.match(html, /Tablero 1 de \d+/);
  assert.match(html, /Armario · Costado izquierdo/);
  // El documento debe abrir y dibujar el plano sin errores.
  const doc = await h.page.context().newPage();
  await doc.setContent(html);
  assert.ok((await doc.locator("svg rect").count()) > 20);
  assert.ok((await doc.locator("tbody tr").count()) > 10);
  await doc.close();
});

test("precios propios: se anotan escribiendo, la IA los actualiza por archivo y el total deja el catálogo de ejemplo", async ({ h, app }) => {
  const sub = () => h.page.textContent("#price-sub");
  const total = () => h.page.textContent("#price-total");
  assert.match(await sub(), /precios de ejemplo/);
  assert.match(await total(), /^US\$ /);

  const said = await h.say("precio melamina 18 blanco 185.000 en Madecentro");
  assert.match(said, /Anotado: Melamina 18 mm Blanco a \$ 185\.000 por tablero en Madecentro\. Desde ahora/);
  await h.page.waitForFunction(() => /tus precios/.test(document.getElementById("price-sub").textContent));
  assert.match(await sub(), /COP · .*faltan \d+ precios · tus precios/);
  assert.match(await total(), /^\$ \d/);
  const sheets = (await h.page.evaluate(() => window.__handy.getQuote().lines.find((l) => l.category === "board" && !l.missing).qty));
  assert.equal(await total(), `$ ${(185000 * sheets).toLocaleString("es-CO")}`);
  const file = join(app.dir, "precios.json");
  const saved = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(saved.entries.length, 1);
  assert.deepEqual([saved.currency, saved.entries[0].store, saved.entries[0].price, saved.entries[0].attributes.thickness], ["COP", "Madecentro", 185000, 18]);

  // La IA anota otro precio por MCP: llega solo al visor.
  const hinge = await h.page.evaluate(() => window.__handy.getQuote().lines.find((l) => l.category === "hinge").need);
  saved.entries.push({ id: "hinge-35-homecenter", category: "hinge", name: "Bisagra cazoleta 35 mm", store: "Homecenter", price: 4500, unit: "unit", seenAt: "2026-09-01", itemId: hinge.itemId, url: "https://example.test/bisagra" });
  writeFileSync(file, JSON.stringify(saved, null, 2));
  await h.page.waitForFunction(() => window.__handy.getPrices().entries.length === 2, null, { timeout: 5000 });
  await h.page.waitForFunction(() => /Tu IA actualizó los precios/.test(document.getElementById("toast").textContent));

  // El resumen dice dónde se compra cada cosa y cuáles precios están viejos.
  await h.page.hover("#price");
  await h.page.waitForFunction(() => /Por tienda/.test(document.getElementById("price-pop").textContent));
  const pop = await h.page.textContent("#price-pop");
  assert.match(pop, /Madecentro/);
  assert.match(pop, /Homecenter · precio viejo/);
  assert.match(pop, /sin precio/);
  assert.match(pop, /1 con más de 30 días/);
  await h.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await h.page.click("#ask-prices");
  await h.page.waitForFunction(() => /Copiado/.test(document.getElementById("toast").textContent));
  const copied = await h.page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /prices_needed/);
  assert.match(copied, /- Tapacanto|- Bisagra|- Excéntrica|- Tornillo/);
  assert.doesNotMatch(copied, /- Melamina 18 mm Blanco/); // ya tiene precio al día
  await h.page.mouse.move(5, 300);

  assert.match(await h.say("¿cuánto cuesta?"), /Va en \$ [\d.]+, y faltan \d+ precios/);
  assert.match(await h.say("precio lavavajillas 2.000.000"), /No encuentro ese renglón/);
  assert.match(await h.say("quita el precio de la bisagra"), /Quité el precio/);
  assert.match(await h.say("quita el precio de la melamina 18 blanco"), /Quité el precio/);
  await h.page.waitForFunction(() => /precios de ejemplo/.test(document.getElementById("price-sub").textContent));
  assert.match(await total(), /^US\$ /);
});

test("tema claro y oscuro cambian los tokens", async ({ h }) => {
  const bg = () => h.page.evaluate("getComputedStyle(document.getElementById('app')).getPropertyValue('--bg').trim()");
  await h.page.evaluate("document.getElementById('app').dataset.theme = 'dark'");
  const dark = await bg();
  await h.page.evaluate("document.getElementById('app').dataset.theme = 'light'");
  assert.notEqual(await bg(), dark);
});

// ---------------------------------------------------------------------------

let failed = 0;
for (const c of cases) {
  if (only && !c.name.includes(only)) continue;
  const app = await startHandy();
  let h;
  try {
    h = await openPage(playwright, app.url);
    await c.fn({ h, app });
    assert.deepEqual(h.errors, [], "errores en la consola del navegador");
    console.log(`  ✓ ${c.name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${c.name}\n      ${String(e.message ?? e).split("\n").slice(0, 6).join("\n      ")}`);
    // La línea de este archivo donde falló, para no adivinar cuál espera se agotó.
    const where = String(e.stack ?? "").split("\n").find((l) => l.includes("run.mjs:"));
    if (where) console.log(`      en ${where.trim().replace(/^at /, "").replace(/.*run\.mjs:/, "run.mjs:").replace(/\)$/, "")}`);
    if (h) await h.page.screenshot({ path: join(app.dir, "fallo.png") }).then(() => console.log(`      captura: ${join(app.dir, "fallo.png")}`)).catch(() => {});
  } finally {
    await h?.close();
    app.stop();
  }
}
console.log(failed ? `\n${failed} de ${cases.length} fallaron` : `\n${cases.length} pruebas de navegador pasaron`);
process.exit(failed ? 1 : 0);
