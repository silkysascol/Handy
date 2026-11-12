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
