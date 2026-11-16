import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  activeProviders, addBlock, addOpening, addPoint, addRoom, checkWorld, createPriceBook, createWorld, describeWorld, dimensionsFor, drillBands, electricalTakeoff, exportGltf,
  placeCabinet, pointPosition, quoteWorld, removePoint, runCommand, setPrice, spreadOutlets, StaticCatalogProvider, updatePoint, type Selection, type StaticCatalog, type World,
} from "../src/index.js";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog-ejemplo.json", import.meta.url), "utf8")) as StaticCatalog;
const example = [new StaticCatalogProvider(catalog)];

function setup(name = "Sala") {
  const w = createWorld("Casa");
  const room = addRoom(w, { name, width: 4000, depth: 3000, height: 2400 });
  const wall = (side: "north" | "east" | "south" | "west"): Selection => ({ kind: "wall", roomId: room.id, wall: side });
  return { w, room, wall, sel: { kind: "room", roomId: room.id } as Selection };
}
const say = (w: World, sel: Selection, text: string) => runCommand(w, sel, text);

describe("puntos eléctricos", () => {
  it("tomas, interruptores y datos salen a su altura habitual, y se dicen con palabras", () => {
    const { w, room, wall } = setup();
    addOpening(w, room.id, { wall: "south", type: "door", offset: 500, width: 800, height: 2050 });
    let r = say(w, wall("north"), "toma a 1 m de la izquierda");
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toBe("Toma en el muro norte, a 1000 mm de la izquierda y 300 mm del piso.");
    expect(r.select).toEqual({ kind: "point", roomId: room.id, pointId: "toma" });
    expect(room.points![0]).toEqual({ id: "toma", name: "Toma", kind: "outlet", wall: "north", offset: 1000, height: 300 });
    // Un interruptor sin posición va junto a la puerta de ese muro.
    r = say(w, wall("south"), "interruptor");
    expect(r.message).toMatch(/Interruptor en el muro sur, a 1450 mm de la izquierda y 1100 mm del piso\. Va junto a la puerta/);
    r = say(w, wall("east"), "toma de tv a 50 cm de la derecha a 1,2 m del piso");
    expect(room.points![2]).toMatchObject({ name: "Toma de TV", kind: "data", wall: "east", offset: 2500, height: 1200 });
    r = say(w, wall("west"), "3 tomas");
    expect(r.message).toMatch(/3 × Toma en el muro oeste, a 500, 1500, 2500 mm de la izquierda/);
    expect(room.points).toHaveLength(6);
    // Ni dentro de una puerta ni fuera del muro; si una de varias no cabe, no queda ninguna.
    expect(say(w, wall("south"), "toma a 80 cm de la izquierda").message).toMatch(/Ahí está la puerta del muro sur/);
    expect(say(w, wall("north"), "toma a 9 m de la izquierda").message).toMatch(/No cabe/);
    expect(say(w, wall("south"), "4 tomas").ok).toBe(false);
    expect(room.points).toHaveLength(6);
    expect(pointPosition(room, room.points![0])).toEqual([1000, 300, 0]);
    expect(describeWorld(w)).toMatch(/- Interruptor \(id: interruptor\): muro sur, a 1450 de la izquierda y 1100 de alto/);
    // Con la habitación seleccionada, una toma pide que se escoja un muro.
    expect(say(w, { kind: "room", roomId: room.id }, "pon una toma").message).toMatch(/haz clic en el muro/);
  });

  it("en cocina y baño las tomas salen con protección, y sobre mesón a 1,10 m", () => {
    const { w, room, wall } = setup("Cocina");
    let r = say(w, wall("north"), "toma de mesón a 1 m de la izquierda");
    expect(room.points![0]).toMatchObject({ name: "Toma de mesón", height: 1100, gfci: true });
    r = say(w, wall("east"), "toma a 50 cm de la izquierda");
    expect(r.message).toMatch(/Cocina es zona húmeda: sale con protección de falla a tierra/);
    expect(room.points![1].gfci).toBe(true);
    const sel: Selection = { kind: "point", roomId: room.id, pointId: room.points![1].id };
    expect(say(w, sel, "sin protección").message).toMatch(/sin protección/);
    expect(room.points![1].gfci).toBeUndefined();
    const dry = setup();
    say(dry.w, dry.wall("north"), "toma");
    expect(dry.room.points![0].gfci).toBeUndefined();
  });

  it("un punto seleccionado se mueve, sube, baja y se quita; las luces van por puntos cardinales", () => {
    const { w, room, wall, sel } = setup();
    say(w, wall("north"), "toma a 1 m de la izquierda");
    const pt: Selection = { kind: "point", roomId: room.id, pointId: "toma" };
    const p = () => room.points!.find((x) => x.id === "toma")!;
    say(w, pt, "muévela 20 cm a la derecha");
    expect(p().offset).toBe(1200);
    say(w, pt, "a 1,1 m del piso");
    expect(p().height).toBe(1100);
    say(w, pt, "bájala 30 cm");
    expect(p().height).toBe(800);
    say(w, pt, "a 50 cm de la derecha");
    expect(p().offset).toBe(3500);
    expect(say(w, pt, "muévela 2 m a la derecha").ok).toBe(false);
    expect(p().offset).toBe(3500);

    let r = say(w, sel, "2 luces");
    expect(r.message).toMatch(/2 luces en el techo de Sala: a 1000 mm del muro oeste y 1500 del norte; a 3000 mm del muro oeste y 1500 del norte/);
    const light: Selection = { kind: "point", roomId: room.id, pointId: "luz" };
    say(w, light, "muévela 50 cm al sur");
    expect(room.points!.find((x) => x.id === "luz")).toMatchObject({ x: 1000, z: 2000 });
    say(w, light, "a 1 m del muro norte");
    expect(room.points!.find((x) => x.id === "luz")).toMatchObject({ x: 1000, z: 1000 });
    r = say(w, sel, "luz a 50 cm del muro este y 50 cm del muro sur");
    expect(room.points!.at(-1)).toMatchObject({ kind: "light", x: 3500, z: 2500 });
    expect(pointPosition(room, room.points!.at(-1)!)).toEqual([3500, 2400, 2500]);
    expect(say(w, pt, "quítala").select).toEqual({ kind: "room", roomId: room.id });
    expect(room.points!.some((x) => x.id === "toma")).toBe(false);
    expect(removePoint(w, room.id, "nada")).toBe(false);
  });

  it("reparte tomas para que ningún tramo libre quede a más de 1,8 m de una", () => {
    const { w, room, sel } = setup();
    addOpening(w, room.id, { wall: "south", type: "door", offset: 0, width: 900, height: 2050 });
    placeCabinet(w, { roomId: room.id, wall: "north", offset: 0, params: { width: 1600, height: 2000, depth: 500 } });
    const r = say(w, sel, "reparte las tomas");
    expect(r.ok, r.message).toBe(true);
    const by = (wall: string) => room.points!.filter((p) => p.wall === wall).map((p) => p.offset);
    // Norte: libre de 1600 a 4000. Sur: libre de 900 a 4000. Este y oeste: 3000 enteros, menos lo que tapa el armario.
    expect(by("north")).toEqual([2800]);
    expect(by("south")).toEqual([2450]);
    expect(by("east")).toEqual([1500]);
    expect(by("west")).toEqual([1250]);
    expect(room.points!.every((p) => p.kind === "outlet" && p.height === 300)).toBe(true);
    // Repetirlo no duplica.
    expect(say(w, sel, "reparte las tomas").ok).toBe(false);
    expect(spreadOutlets(w, room.id)).toEqual([]);
    // Un muro de 5 m necesita dos.
    const big = setup();
    big.room.width = 5000;
    spreadOutlets(big.w, big.room.id);
    expect(big.room.points!.filter((p) => p.wall === "north").map((p) => p.offset)).toEqual([1250, 3750]);
  });

  it("avisa si un mueble tapa un punto o se fija sobre la vertical por donde suele ir la tubería", () => {
    const { w, room } = setup();
    addPoint(w, room.id, { kind: "outlet", wall: "north", offset: 1000 });
    addPoint(w, room.id, { kind: "switch", wall: "north", offset: 2600 });
    expect(drillBands(room)).toEqual([{ wall: "north", from: 900, to: 1100, pointId: "toma", name: "Toma" }, { wall: "north", from: 2500, to: 2700, pointId: "interruptor", name: "Interruptor" }]);
    const low = placeCabinet(w, { roomId: room.id, wall: "north", offset: 600, params: { width: 800, height: 720, depth: 500 } });
    const codes = (id: string) => checkWorld(w).filter((i) => i.itemId === id && /point|drill/.test(i.code)).map((i) => i.code);
    expect(codes(low.id)).toEqual(["point-covered"]);
    expect(checkWorld(w).find((i) => i.code === "point-covered")!.message).toMatch(/Gabinete 800 tapa toma del muro norte en Sala\. Si la necesitas/);
    // Un mueble colgado encima de la toma no la tapa, pero se atornilla sobre su vertical.
    const hung = placeCabinet(w, { roomId: room.id, wall: "north", offset: 600, elevation: 1500, name: "Alto", params: { width: 800, height: 700, depth: 300 } });
    expect(codes(hung.id)).toEqual(["drill-band"]);
    expect(checkWorld(w).find((i) => i.code === "drill-band")!.message).toMatch(/Alto se fija al muro norte sobre la vertical de toma \(a 1000 mm de la izquierda\)/);
    // Un armario alto frente al interruptor lo deja sin poder accionarse.
    const tall = placeCabinet(w, { roomId: room.id, wall: "north", offset: 2200, name: "Armario", params: { width: 800, height: 2000, depth: 500 } });
    expect(checkWorld(w).find((i) => i.itemId === tall.id && i.code === "point-covered")!.message).toMatch(/no se podrá accionar/);
    // Un mueble bajo lejos de los puntos, o suelto en el cuarto, no avisa.
    const far = placeCabinet(w, { roomId: room.id, wall: "south", offset: 100, params: { width: 800, height: 720, depth: 500 } });
    expect(codes(far.id)).toEqual([]);
  });

  it("no deja poner puntos en vanos ni en muro tapado por una columna, y la luz no va dentro de una", () => {
    const { w, room } = setup();
    addOpening(w, room.id, { wall: "east", type: "window", offset: 1000, width: 1200, height: 1200, sill: 1000 });
    addBlock(w, room.id, { x: 0, z: 0, width: 600, depth: 600 });
    expect(() => addPoint(w, room.id, { kind: "switch", wall: "east", offset: 1500 })).toThrow(/Ahí está la ventana/);
    // Bajo el antepecho sí cabe una toma.
    expect(addPoint(w, room.id, { kind: "outlet", wall: "east", offset: 1500 }).height).toBe(300);
    expect(() => addPoint(w, room.id, { kind: "outlet", wall: "north", offset: 300 })).toThrow(/lo tapa Columna/);
    expect(() => addPoint(w, room.id, { kind: "light", x: 300, z: 300 })).toThrow(/Ahí está Columna/);
    expect(() => updatePoint(w, room.id, "toma", { height: 1500 })).toThrow(/Ahí está la ventana/);
    expect(room.points![0].height).toBe(300);
    expect(() => addPoint(w, room.id, { kind: "outlet", wall: "north", offset: 1000, height: 2390 })).toThrow(/altura/);
  });

  it("estima materiales, entra al presupuesto con sus propios precios, y sale en cotas y en Blender", async () => {
    const { w, room } = setup("Cocina");
    addPoint(w, room.id, { kind: "light", x: 2000, z: 1500 });
    addPoint(w, room.id, { kind: "switch", wall: "south", offset: 1000 });
    addPoint(w, room.id, { kind: "outlet", wall: "north", offset: 2000 });
    addPoint(w, room.id, { kind: "outlet", wall: "north", offset: 3000, gfci: false });
    const t = electricalTakeoff(room);
    expect(t).toMatchObject({ outlets: 2, gfci: 1, switches: 1, lights: 1, boxes: 4 });
    // Interruptor: 1,3 m hasta el techo + 2,5 m hasta la luz. Tomas: 2,1 + 1,5 y 2,1 + 2,5.
    expect(t.conduitM).toBe(12);
    expect(t.wireM).toBe(39.6);
    const q = await quoteWorld(w, example);
    expect(q.groups.electrical).toBeGreaterThan(0);
    expect(q.subtotal).toBe(q.groups.electrical);
    expect(q.missingCount).toBe(0);
    expect(q.lines.map((l) => l.description)).toEqual([
      "Cocina · Toma doble con polo a tierra", "Cocina · Toma con protección de falla a tierra (GFCI)", "Cocina · Interruptor sencillo", "Cocina · Roseta o plafón para luz",
      "Cocina · Caja eléctrica 2 x 4", "Cocina · Tubería conduit de 1/2 pulgada (m, estimado)", "Cocina · Cable de cobre calibre 12 (m, estimado)",
    ]);
    expect(q.lines.find((l) => /GFCI/.test(l.description))!.offer!.name).toBe("Toma GFCI 15 A");
    // Con precio propio para el cable por rollo de 100 m, compra un rollo.
    const book = createPriceBook();
    setPrice(book, q.lines.find((l) => l.category === "wire")!.need, { name: "Cable 12 rollo 100 m", store: "Homecenter", price: 280000, packSize: 100, seenAt: "2026-11-16" });
    const real = await quoteWorld(w, activeProviders(book, example));
    expect(real.lines.find((l) => l.category === "wire")).toMatchObject({ qty: 1, total: 280000, unit: "pack" });

    const dims = dimensionsFor(w, { kind: "point", roomId: room.id, pointId: "interruptor" });
    expect(dims.map((d) => d.value).sort((a, b) => a - b)).toEqual([1000, 1100, 3000]);
    const gltf = JSON.parse(exportGltf(w)) as { nodes: { name?: string; extras?: { handy?: { point?: string; kind?: string } } }[] };
    expect(gltf.nodes.filter((n) => n.extras?.handy?.point).map((n) => n.extras!.handy!.kind)).toEqual(["light", "switch", "outlet", "outlet"]);
  });
});
