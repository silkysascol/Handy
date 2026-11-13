#!/usr/bin/env node
/**
 * Pruebas de extremo a extremo del visor, en un navegador real.
 *   pnpm --filter @handy/web e2e            (requiere haber construido: pnpm build)
 * Si Playwright no está instalado se omiten con un aviso, salvo E2E_REQUIRED=1.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
    if (h) await h.page.screenshot({ path: join(app.dir, "fallo.png") }).then(() => console.log(`      captura: ${join(app.dir, "fallo.png")}`)).catch(() => {});
  } finally {
    await h?.close();
    app.stop();
  }
}
console.log(failed ? `\n${failed} de ${cases.length} fallaron` : `\n${cases.length} pruebas de navegador pasaron`);
process.exit(failed ? 1 : 0);
