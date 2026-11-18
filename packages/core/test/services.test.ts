import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  addFixture, addPoint, addRoom, checkWorld, createWorld, describeWorld, drillBands, electricalTakeoff, placeCabinet, quoteWorld, runCommand, StaticCatalogProvider,
  type Selection, type StaticCatalog, type World,
} from "../src/index.js";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog-ejemplo.json", import.meta.url), "utf8")) as StaticCatalog;

function setup(name = "Cocina") {
  const w = createWorld("Casa");
  const room = addRoom(w, { name, width: 4000, depth: 3000, height: 2400 });
  const wall = (side: "north" | "east" | "south" | "west"): Selection => ({ kind: "wall", roomId: room.id, wall: side });
  return { w, room, wall };
}
const say = (w: World, sel: Selection, text: string) => runCommand(w, sel, text);
const codes = (w: World) => checkWorld(w).map((i) => i.code).filter((c) => /service|gas|outlet-near|point|drill/.test(c));

describe("agua, desagüe y gas", () => {
  it("el punto de un aparato trae su conjunto a las alturas habituales", () => {
    const { w, room, wall } = setup();
    let r = say(w, wall("north"), "punto de lavaplatos a 1,5 m de la izquierda");
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toMatch(/Lavaplatos en el muro norte, con eje a 1500 mm de la izquierda: agua · lavaplatos a 1400 mm de la izquierda y 550 mm del piso; desagüe · lavaplatos a 1500 mm de la izquierda y 500 mm del piso\./);
    expect(room.points!.map((p) => [p.kind, p.offset, p.height])).toEqual([["water", 1400, 550], ["drain", 1500, 500]]);
    expect(r.select).toEqual({ kind: "point", roomId: room.id, pointId: room.points![1].id });
    r = say(w, wall("east"), "punto de lavadora con agua caliente");
    expect(room.points!.slice(2).map((p) => [p.name, p.offset, p.height])).toEqual([["Agua · lavadora", 1400, 1100], ["Desagüe · lavadora", 1600, 900], ["Agua caliente · lavadora", 1600, 1100]]);
    expect(r.message).toMatch(/va alto para que no se devuelva el agua/);
    r = say(w, wall("south"), "punto de sanitario a 80 cm de la izquierda");
    expect(room.points!.at(-1)).toMatchObject({ kind: "water", offset: 650, height: 200 });
    expect(r.message).toMatch(/El desagüe del sanitario va en el piso/);
    say(w, wall("south"), "ducha a 1 m de la derecha");
    expect(room.points!.slice(-2).map((p) => [p.name, p.height])).toEqual([["Mezclador de ducha", 1100], ["Salida de ducha", 2000]]);
    // Si uno de los puntos no cabe, no queda ninguno.
    const before = room.points!.length;
    expect(say(w, wall("west"), "punto de lavadora a 10 cm de la izquierda").ok).toBe(false);
    expect(room.points).toHaveLength(before);
    expect(say(w, wall("west"), "punto de lavaplatos a 1,2 m del piso").message).toMatch(/salen a su altura habitual/);
    expect(room.points).toHaveLength(before);
    expect(describeWorld(w)).toMatch(/Instalaciones: eléctrico, agua, desagüe y gas/);
  });

  it("puntos sueltos, y la diferencia entre una toma eléctrica y un punto de agua", () => {
    const { w, room, wall } = setup("Lavadero");
    say(w, wall("north"), "punto de agua a 1 m de la izquierda");
    say(w, wall("north"), "desagüe a 1,2 m de la izquierda");
    say(w, wall("north"), "punto de gas a 50 cm de la derecha a 1,3 m del piso");
    say(w, wall("north"), "toma de agua caliente a 2 m de la izquierda");
    expect(room.points!.map((p) => [p.kind, p.name, p.offset, p.height])).toEqual([["water", "Punto de agua", 1000, 550], ["drain", "Desagüe", 1200, 500], ["gas", "Punto de gas", 3500, 1300], ["water", "Agua caliente", 2000, 550]]);
    // "toma para la lavadora" es una toma eléctrica, con protección porque el lavadero es zona húmeda.
    say(w, wall("east"), "toma para la lavadora a 1 m de la izquierda a 1,2 m del piso");
    expect(room.points!.at(-1)).toMatchObject({ kind: "outlet", gfci: true, height: 1200 });
    // Se mueven y se quitan como cualquier punto.
    const sel: Selection = { kind: "point", roomId: room.id, pointId: "punto-de-gas" };
    say(w, sel, "a 70 cm del piso");
    expect(room.points!.find((p) => p.id === "punto-de-gas")!.height).toBe(700);
    say(w, sel, "quítala");
    expect(room.points!.some((p) => p.kind === "gas")).toBe(false);
    // Con la habitación seleccionada, pide escoger un muro.
    expect(say(w, { kind: "room", roomId: room.id }, "punto de lavadora").message).toMatch(/haz clic en el muro/);
    // Las franjas de no perforar también cubren agua y gas; el estimado eléctrico no los cuenta.
    expect(drillBands(room).map((b) => b.name)).toContain("Punto de agua");
    expect(electricalTakeoff(room)).toMatchObject({ outlets: 1, boxes: 1 });
  });

  it("el mueble del lavaplatos debe ser de puertas y sin repisa en el sifón", () => {
    const { w, room } = setup();
    addFixture(w, room.id, "lavaplatos", "north", 1500);
    // Un módulo de puertas delante del lavaplatos es lo esperado: sin avisos.
    const doors = placeCabinet(w, { roomId: room.id, wall: "north", offset: 1100, name: "Bajo lavaplatos", params: { width: 800, height: 900, depth: 600, doors: 2 } });
    expect(codes(w)).toEqual([]);
    // Con repisa, estorba al sifón.
    doors.params.shelves = 1;
    expect(codes(w)).toEqual(["service-shelf"]);
    expect(checkWorld(w).find((i) => i.code === "service-shelf")!.message).toMatch(/Bajo lavaplatos tiene repisa donde va desagüe · lavaplatos/);
    // Una cajonera ahí choca con el sifón y la tubería.
    w.items.length = 0;
    placeCabinet(w, { roomId: room.id, wall: "north", offset: 1100, name: "Cajonera", params: { width: 800, height: 900, depth: 600, drawers: 4 } });
    expect(codes(w)).toEqual(["service-drawers", "service-drawers"]);
    expect(checkWorld(w).find((i) => i.code === "service-drawers")!.message).toMatch(/Ese módulo debe ser de puertas/);
    // Un mueble alto colgado encima no los tapa, pero se atornilla sobre su vertical.
    w.items.length = 0;
    placeCabinet(w, { roomId: room.id, wall: "north", offset: 1100, elevation: 1500, name: "Alto", params: { width: 800, height: 700, depth: 300, doors: 2 } });
    expect(codes(w)).toEqual(["drill-band", "drill-band"]);
  });

  it("avisa de gas encerrado, de electricidad junto al gas y de tomas sin protección junto al agua", () => {
    const { w, room } = setup("Sala");
    addFixture(w, room.id, "estufa", "north", 2000);
    placeCabinet(w, { roomId: room.id, wall: "north", offset: 1600, name: "Bajo estufa", params: { width: 800, height: 900, depth: 600, doors: 2 } });
    expect(checkWorld(w).find((i) => i.code === "gas-enclosed")!.message).toMatch(/Gas · estufa queda dentro de Bajo estufa, que es cerrado/);
    // Un módulo abierto no encierra el gas.
    w.items[0].params.doors = 0;
    expect(codes(w)).toEqual([]);
    w.items.length = 0;
    addPoint(w, room.id, { kind: "outlet", wall: "north", offset: 2300, height: 700 });
    expect(codes(w)).toEqual(["gas-near-electric"]);
    // Una toma a 30 cm del piso, lejos en altura del gas a 70, no cuenta... pero a 40 cm de un punto de agua sin protección, sí.
    room.points = room.points!.filter((p) => p.kind !== "outlet");
    addPoint(w, room.id, { kind: "water", wall: "east", offset: 1000 });
    addPoint(w, room.id, { kind: "outlet", wall: "east", offset: 1400 });
    expect(codes(w)).toEqual(["outlet-near-water"]);
    expect(checkWorld(w).find((i) => i.code === "outlet-near-water")!.message).toMatch(/queda a 400 mm de punto de agua y no tiene protección/);
    room.points!.at(-1)!.gfci = true;
    expect(codes(w)).toEqual([]);
  });

  it("entran al presupuesto como grupo aparte, sin tubería", async () => {
    const { w, room } = setup();
    addFixture(w, room.id, "lavaplatos", "north", 1500, { hot: true });
    addFixture(w, room.id, "estufa", "east", 1500);
    const q = await quoteWorld(w, [new StaticCatalogProvider(catalog)]);
    expect(q.lines.map((l) => [l.description, l.qty])).toEqual([["Cocina · Llave angular y acople flexible", 2], ["Cocina · Sifón y desagüe", 1], ["Cocina · Válvula y manguera de gas", 1]]);
    expect(q.groups.services).toBe(q.subtotal);
    expect(q.groups.electrical).toBe(0);
    expect(q.missingCount).toBe(0);
  });
});
