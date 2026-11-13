import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  activeProviders, addRoom, createPriceBook, createWorld, needKey, parseMoney, parseNeedKey, placeCabinet, quoteWorld, removePrice, runCommand, runPriceCommand,
  setPrice, StaticCatalogProvider, isPriceCommand, type PriceBook, type StaticCatalog, type World,
} from "../src/index.js";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog-ejemplo.json", import.meta.url), "utf8")) as StaticCatalog;
const example = [new StaticCatalogProvider(catalog)];
const TODAY = "2026-11-13";

function house(): World {
  const w = createWorld("Casa");
  const room = addRoom(w, { name: "Dormitorio", width: 3600, depth: 3200, height: 2400 });
  placeCabinet(w, { roomId: room.id, wall: "north", offset: 200, name: "Armario", params: { width: 900, height: 2000, depth: 500, shelves: 3, doors: 2, joinery: "minifix" } });
  expect(runCommand(w, { kind: "room", roomId: room.id }, "piso de porcelanato 60 x 60").ok).toBe(true);
  expect(runCommand(w, { kind: "wall", roomId: room.id, wall: "east" }, "mesa de tubo de 120 x 75 x 60").ok).toBe(true);
  return w;
}
const quote = (w: World, book?: PriceBook) => quoteWorld(w, activeProviders(book, example), undefined, { today: TODAY });

describe("libro de precios propio", () => {
  it("sin precios propios se usa el catálogo de ejemplo; con el primero, solo los propios", async () => {
    const w = house();
    const before = await quote(w);
    expect(before.currency).toBe("USD");
    expect(before.missingCount).toBe(0);
    expect(before.byStore.map((s) => s.store)).toEqual([catalog.name]);

    const book = createPriceBook();
    const board = before.lines.find((l) => l.category === "board" && /18/.test(l.description))!;
    setPrice(book, board.need, { name: "Melamina blanca 18 mm 1830x2440", store: "Madecentro", price: 185000, url: "https://example.test/melamina", seenAt: TODAY });
    const after = await quote(w, book);
    expect(after.currency).toBe("COP");
    expect(after.currencies).toEqual(["COP"]);
    const mine = after.lines.find((l) => needKey(l.need) === needKey(board.need))!;
    expect(mine.missing).toBe(false);
    expect(mine.total).toBe(185000 * mine.qty);
    expect(mine.offer).toMatchObject({ store: "Madecentro", fetchedAt: TODAY, url: "https://example.test/melamina" });
    // Todo lo demás queda como faltante: nunca se mezclan precios de ejemplo en dólares con los reales.
    expect(after.missingCount).toBe(after.lines.length - 1);
    expect(after.subtotal).toBe(mine.total);
  });

  it("cada renglón trae lo que necesita, y con eso se completa el presupuesto entero", async () => {
    const w = house();
    const book = createPriceBook();
    const lines = (await quote(w)).lines;
    for (const key of new Set(lines.map((l) => needKey(l.need)))) {
      // La clave viaja como texto (a la IA y de vuelta) sin perder nada.
      const need = parseNeedKey(key);
      expect(needKey(need)).toBe(key);
      setPrice(book, need, { name: lines.find((l) => needKey(l.need) === key)!.description, store: need.category === "board" ? "Madecentro" : "Homecenter", price: 1000, seenAt: TODAY });
    }
    const q = await quote(w, book);
    expect(q.missingCount).toBe(0);
    expect(q.lines.every((l) => l.unitPrice === 1000)).toBe(true);
    expect(q.byStore.map((s) => s.store).sort()).toEqual(["Homecenter", "Madecentro"]);
    expect(q.byStore.reduce((a, s) => a + s.total, 0)).toBe(q.subtotal);
    expect(q.groups.floors).toBeGreaterThan(0);
    expect(() => parseNeedKey("melamina")).toThrow(/clave/);
  });

  it("gana la tienda más barata por unidad, también cuando una vende por caja o por rollo", async () => {
    const w = house();
    const book = createPriceBook();
    const lines = (await quote(w)).lines;
    const screws = lines.find((l) => l.need.itemId === "back-screw")!;
    setPrice(book, screws.need, { name: "Tornillo 3,5 x 16", store: "Ferretería", price: 150, seenAt: TODAY });
    setPrice(book, screws.need, { name: "Tornillo 3,5 x 16 caja x 100", store: "Homecenter", price: 9000, packSize: 100, seenAt: TODAY });
    let line = (await quote(w, book)).lines.find((l) => l.need.itemId === "back-screw")!;
    expect(line.offer!.store).toBe("Homecenter"); // 90 por tornillo contra 150
    expect(line.unit).toBe("pack");
    expect(line.qty).toBe(Math.ceil(screws.qty / 100));
    expect(line.total).toBe(9000 * line.qty);

    const edge = lines.find((l) => l.category === "edgeband")!;
    setPrice(book, edge.need, { name: "Canto blanco rollo 50 m", store: "Madecentro", price: 40000, packSize: 50, seenAt: TODAY });
    line = (await quote(w, book)).lines.find((l) => l.category === "edgeband")!;
    expect(line.qty).toBe(Math.ceil(edge.qty / 50));
    expect(line.total).toBe(40000 * line.qty);

    // Baldosas: se compara por pieza y las cajas se recalculan con las de la tienda.
    const tile = lines.find((l) => l.category === "tile")!;
    setPrice(book, tile.need, { name: "Porcelanato 60x60", store: "Homecenter", price: 90000, packSize: 4, seenAt: TODAY });
    setPrice(book, tile.need, { name: "Porcelanato 60x60", store: "Cerámica Italia", price: 100000, packSize: 5, seenAt: TODAY });
    line = (await quote(w, book)).lines.find((l) => l.category === "tile")!;
    expect(line.offer!.store).toBe("Cerámica Italia"); // 20.000 por pieza contra 22.500
    expect(line.description).toContain("caja de 5");
  });

  it("un precio por herraje concreto no se aplica a los demás de su categoría; anotar dos veces actualiza", async () => {
    const w = house();
    const book = createPriceBook();
    const lines = (await quote(w)).lines;
    const cam = lines.find((l) => l.need.itemId === "minifix-cam-15")!;
    const first = setPrice(book, cam.need, { name: "Excéntrica", store: "Madecentro", price: 800, seenAt: "2026-10-01" });
    const again = setPrice(book, cam.need, { name: "Excéntrica", store: "madecentro", price: 900, seenAt: TODAY });
    expect(again.id).toBe(first.id);
    expect(book.entries).toHaveLength(1);
    const q = await quote(w, book);
    expect(q.lines.find((l) => l.need.itemId === "minifix-cam-15")!.unitPrice).toBe(900);
    expect(q.lines.find((l) => l.need.itemId === "minifix-bolt")!.missing).toBe(true);
    removePrice(book, first.id);
    expect(book.entries).toHaveLength(0);
    expect(() => removePrice(book, "nada")).toThrow();
    expect(() => setPrice(book, cam.need, { name: "x", store: "y", price: 0, seenAt: TODAY })).toThrow(/mayor que cero/);
  });

  it("avisa de precios viejos", async () => {
    const w = house();
    const book = createPriceBook();
    const lines = (await quote(w)).lines;
    setPrice(book, lines[0].need, { name: "a", store: "Madecentro", price: 10, seenAt: "2026-09-01" });
    setPrice(book, lines.find((l) => l.category === "edgeband")!.need, { name: "b", store: "Madecentro", price: 10, seenAt: "2026-11-01" });
    const q = await quote(w, book);
    expect(q.staleCount).toBe(1);
    expect(q.oldestPrice).toBe("2026-09-01");
  });

  it("una estructura de tubo sola, sin tableros, también se cotiza", async () => {
    const w = createWorld("Taller");
    const room = addRoom(w, { name: "Taller", width: 4000, depth: 3000, height: 2400 });
    expect(runCommand(w, { kind: "wall", roomId: room.id, wall: "north" }, "estantería de tubo de 100 x 180 x 40 sin tablero").ok).toBe(true);
    const q = await quote(w);
    expect(q.lines.some((l) => l.category === "steel-profile")).toBe(true);
    expect(q.subtotal).toBeGreaterThan(0);
  });
});

describe("anotar precios escribiendo", () => {
  it("entiende la plata como se escribe aquí", () => {
    expect(parseMoney("185.000")).toBe(185000);
    expect(parseMoney("$ 4.500")).toBe(4500);
    expect(parseMoney("1.250.000")).toBe(1250000);
    expect(parseMoney("62,5")).toBe(62.5);
    expect(parseMoney("185 mil")).toBe(185000);
    expect(parseMoney("1,2 millones")).toBe(1200000);
    expect(parseMoney("gratis")).toBeUndefined();
    expect(isPriceCommand("la bisagra vale 4.500")).toBe(true);
    expect(isPriceCommand("agrega una repisa")).toBe(false);
  });

  it("busca el renglón por sus palabras y anota tienda, valor y presentación", async () => {
    const w = house();
    const book = createPriceBook();
    const lines = (await quote(w)).lines;
    const say = (t: string) => runPriceCommand(book, lines, t, TODAY, (n) => `$${n}`);

    let r = say("precio melamina 18 blanco 185.000 en Madecentro");
    expect(r.ok, r.message).toBe(true);
    expect(r.entry).toMatchObject({ category: "board", store: "Madecentro", price: 185000, unit: "sheet", seenAt: TODAY });
    expect(r.entry!.attributes).toMatchObject({ thickness: 18 });
    expect(r.message).toMatch(/Anotado: .* a \$185000 por tablero en Madecentro\. Desde ahora/);

    r = say("la bisagra vale 4.500 en homecenter");
    expect(r.entry).toMatchObject({ category: "hinge", price: 4500, store: "Homecenter", unit: "unit" });
    expect(r.message).not.toMatch(/Desde ahora/);

    // "40x40" y "6 m" son medidas; la plata es el otro número.
    r = say("el tubo 40x40 cuesta 62 mil en la ferretería del barrio");
    expect(r.ok, r.message).toBe(true);
    expect(r.entry).toMatchObject({ category: "steel-profile", price: 62000, store: "Ferreteria Del Barrio" });

    r = say("precio tornillo fondo 9.000 caja de 100 en Homecenter");
    expect(r.entry).toMatchObject({ itemId: "back-screw", unit: "pack", packSize: 100, price: 9000 });

    r = say("precio porcelanato 60 x 60 89.900 caja de 4 en Homecenter");
    expect(r.ok, r.message).toBe(true);
    expect(r.entry).toMatchObject({ category: "tile", price: 89900, unit: "pack" });
    expect(r.entry!.attributes).toMatchObject({ material: "porcelain", width: 600, length: 600, piecesPerBox: 4 });

    const q = await quote(w, book);
    expect(q.lines.find((l) => l.category === "tile")!.total).toBe(89900 * q.lines.find((l) => l.category === "tile")!.qty);
    expect(q.byStore[0].store).toBe("Homecenter");
  });

  it("pide más detalle si hay varios, dice lo que hay si no encuentra, y borra precios", async () => {
    const w = house();
    const book = createPriceBook();
    const lines = (await quote(w)).lines;
    const say = (t: string) => runPriceCommand(book, lines, t, TODAY);

    let r = say("precio tornillo 100");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/varios renglones/);
    r = say("precio lavavajillas 2.000.000");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/No encuentro ese renglón/);
    r = say("precio de la bisagra en Homecenter");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/No veo el valor/);
    expect(book.entries).toHaveLength(0);

    expect(say("precio bisagra 4.500 en Homecenter").ok).toBe(true);
    expect(say("precio bisagra 4.200 en Madecentro").ok).toBe(true);
    expect(book.entries).toHaveLength(2);
    expect((await quote(w, book)).lines.find((l) => l.category === "hinge")!.offer!.store).toBe("Madecentro");
    r = say("quita el precio de la bisagra en Madecentro");
    expect(r.ok, r.message).toBe(true);
    expect(book.entries.map((e) => e.store)).toEqual(["Homecenter"]);
    expect(say("quita el precio de la boquilla").ok).toBe(false);
    expect(runPriceCommand(book, [], "precio bisagra 100", TODAY).message).toMatch(/Aún no hay nada que cotizar/);
  });
});
