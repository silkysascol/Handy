import { describe, expect, it } from "vitest";
import {
  addFixture, addOpening, addRoom, buildCutPlan, buildKitchen, checkWorld, createWorld, generateCabinet, itemBox, itemModel, mergedModel, overlaps, panelBox, planKitchen, runCommand,
  type Selection, type World,
} from "../src/index.js";

function setup(width = 4000) {
  const w = createWorld("Casa");
  const room = addRoom(w, { name: "Cocina", width, depth: 3000, height: 2400 });
  return { w, room, north: { kind: "wall", roomId: room.id, wall: "north" } as Selection };
}
const widths = (w: World, elevation: number) => w.items.filter((i) => i.elevation === elevation).sort((a, b) => a.offset - b.offset).map((i) => [i.name, i.offset, i.params.width]);

describe("cocina por módulos", () => {
  it("acomoda el lavaplatos sobre su desagüe, la estufa sobre su gas y llena el resto", () => {
    const { w, room } = setup();
    addFixture(w, room.id, "lavaplatos", "north", 1200);
    addFixture(w, room.id, "estufa", "north", 2900);
    const { plan, items } = buildKitchen(w, { roomId: room.id, wall: "north" });
    expect(plan).toMatchObject({ from: 0, length: 4000 });
    expect(widths(w, 0)).toEqual([["Bajo 1", 0, 800], ["Bajo lavaplatos", 800, 800], ["Bajo 2", 1600, 500], ["Cajonera de cocina", 2100, 500], ["Bajo estufa", 2600, 600], ["Bajo 3", 3200, 800]]);
    // La fila no deja huecos ni se solapa.
    const bases = w.items.filter((i) => i.elevation === 0).sort((a, b) => a.offset - b.offset);
    bases.forEach((b, i) => { if (i) expect(b.offset).toBe(bases[i - 1].offset + bases[i - 1].params.width); });
    // El del lavaplatos es de puertas y sin repisa; el de la estufa, abierto; los cajones, junto a la estufa.
    expect(bases.find((b) => b.name === "Bajo lavaplatos")!.params).toMatchObject({ doors: 2, shelves: 0 });
    expect(bases.find((b) => b.name === "Bajo estufa")!.params).toMatchObject({ doors: 0 });
    expect(bases.find((b) => b.name === "Cajonera de cocina")!.params).toMatchObject({ drawers: 3 });
    // Por construcción no hay cajones contra el sifón ni gas encerrado.
    expect(checkWorld(w).filter((i) => /service|gas|overlap|hits|shelf-sag/.test(i.code))).toEqual([]);
    // Las puertas de un módulo no chocan con el vecino por culpa del vuelo del mesón.
    expect(checkWorld(w).filter((i) => i.code === "motion-collision" && /choca con (Bajo|Cajonera|Alto)/.test(i.message))).toEqual([]);
    expect(items).toHaveLength(w.items.length);
    expect(plan.notes.join(" ")).toMatch(/calado del lavaplatos/);
  });

  it("un solo mesón corrido cubre toda la fila y los demás módulos van debajo", () => {
    const { w, room } = setup();
    addFixture(w, room.id, "lavaplatos", "north", 1200);
    buildKitchen(w, { roomId: room.id, wall: "north", length: 2400, uppers: false });
    const bases = w.items.slice().sort((a, b) => a.offset - b.offset);
    expect(bases.map((b) => [!!b.params.countertop, !!b.params.underCountertop])).toEqual([[true, false], [false, true], [false, true]]);
    const top = itemModel(bases[0]).panels.find((p) => p.id === "countertop")!;
    expect([top.name, top.height, top.width]).toEqual(["Mesón corrido", 2400, 638]);
    // Todos los cuerpos bajan 18 mm para quedar a ras bajo el mesón.
    for (const b of bases) expect(itemModel(b).panels.find((p) => p.id === "side-left")!.height).toBe(882);
    // El mesón de 2,4 m cabe en un tablero; uno de 4 m no, y el plan lo dice.
    expect(buildCutPlan(mergedModel(w)).oversize).toEqual([]);
    const long = planKitchen(setup().w, { roomId: "cocina", wall: "north" });
    expect(long.notes.join(" ")).toMatch(/El mesón mide 4000 mm y no sale de un tablero de 2,44 m/);
    expect(buildCutPlan(generateCabinet(long.modules[0].params)).oversize.map((o) => o.name)).toEqual(["Mesón corrido"]);
    // El mesón queda justo encima de los cuerpos vecinos, sin meterse en ellos.
    const box = panelBox(top)!;
    expect(box.min[1]).toBe(882);
    const world = (b: typeof bases[number]) => itemBox(room, b);
    expect(overlaps(world(bases[0]), world(bases[1]), 1)).toBe(false);
  });

  it("los altos respetan la ventana y dejan libre sobre la estufa para la campana", () => {
    const { w, room } = setup();
    addOpening(w, room.id, { wall: "north", type: "window", offset: 600, width: 1200, height: 1000, sill: 1100 });
    addFixture(w, room.id, "lavaplatos", "north", 1200);
    addFixture(w, room.id, "estufa", "north", 2900);
    const { plan } = buildKitchen(w, { roomId: room.id, wall: "north" });
    // Altos: de 0 a 600 (antes de la ventana), de 1800 a 2600 (hasta la estufa) y de 3200 a 4000.
    expect(widths(w, 1500)).toEqual([["Alto 1", 0, 600], ["Alto 2", 1800, 800], ["Alto 3", 3200, 800]]);
    expect(plan.notes.join(" ")).toMatch(/Sobre la estufa dejé libre para la campana/);
    expect(checkWorld(w).filter((i) => /blocks-window|overlap/.test(i.code))).toEqual([]);
    const none = setup();
    buildKitchen(none.w, { roomId: none.room.id, wall: "north", uppers: false });
    expect(none.w.items.every((i) => i.elevation === 0)).toBe(true);
  });

  it("usa el tramo libre, reparte en módulos de hasta 80 cm y avisa de lo que no cabe", () => {
    const { w, room } = setup(5000);
    addOpening(w, room.id, { wall: "north", type: "door", offset: 0, width: 900, height: 2050 });
    const plan = planKitchen(w, { roomId: room.id, wall: "north", uppers: false });
    // Arranca después de la puerta y se limita a 4 m.
    expect([plan.from, plan.length]).toEqual([900, 4000]);
    expect(plan.modules.map((m) => m.params.width)).toEqual([800, 800, 800, 800, 800]);
    expect(plan.notes.join(" ")).toMatch(/No hay punto de lavaplatos en este tramo/);
    // Un largo que no se reparte parejo: el último módulo se queda con el resto.
    expect(planKitchen(w, { roomId: room.id, wall: "north", length: 2000, uppers: false }).modules.map((m) => m.params.width)).toEqual([666, 666, 668]);
    expect(planKitchen(w, { roomId: room.id, wall: "north", length: 9000, uppers: false }).notes[0]).toMatch(/Pediste 9000 mm y el tramo libre da 4100/);
    // Lavaplatos y gas pegados: no pone módulo de estufa y lo explica.
    addFixture(w, room.id, "lavaplatos", "north", 2000);
    addFixture(w, room.id, "estufa", "north", 2300);
    const tight = planKitchen(w, { roomId: room.id, wall: "north", uppers: false });
    expect(tight.modules.some((m) => m.role === "stove")).toBe(false);
    expect(tight.notes.join(" ")).toMatch(/El punto de gas queda encima del módulo del lavaplatos/);
    // Sin tramo libre no hay cocina, y si un módulo falla no queda ninguno.
    const tiny = setup(1000);
    addOpening(tiny.w, tiny.room.id, { wall: "north", type: "door", offset: 100, width: 800, height: 2050 });
    expect(() => buildKitchen(tiny.w, { roomId: tiny.room.id, wall: "north" })).toThrow(/no hay un tramo libre/);
    expect(tiny.w.items).toHaveLength(0);
  });

  it("se pide con palabras sobre un muro", () => {
    const { w, room, north } = setup();
    addFixture(w, room.id, "lavaplatos", "north", 1200);
    const r = runCommand(w, north, "cocina de 2,4 m sin altos");
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toMatch(/Cocina de 2400 mm en el muro norte, desde 0 mm de la izquierda: 3 bajo\(s\) con mesón corrido\. Bajos: Bajo 1 800 · Bajo lavaplatos 800 · Bajo 2 800\./);
    expect(w.items).toHaveLength(3);
    expect(r.select).toEqual({ kind: "item", itemId: w.items[0].id });
    // Con estufa y lavaplatos en la frase sigue siendo una cocina, no puntos de servicio.
    const other = setup();
    const full = runCommand(other.w, other.north, "cocina con estufa y lavaplatos a 20 cm de la izquierda");
    expect(full.ok, full.message).toBe(true);
    expect(other.room.points).toBeUndefined();
    expect(other.w.items.filter((i) => i.elevation === 0)[0].offset).toBe(200);
    expect(other.w.items.some((i) => i.elevation === 1500)).toBe(true);
    // Una cajonera sigue siendo un mueble suelto, no una cocina.
    expect(runCommand(other.w, { kind: "wall", roomId: other.room.id, wall: "south" }, "cajonera de 80 x 90 x 50").message).toMatch(/^Cajonera de 800/);
  });
});
