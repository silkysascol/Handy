import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  addRoom, buildCutPlan, buildQuote, checkMotionCollisions, checkWorld, createWorld, generateCabinet, overlaps, panelBox, panelInstances,
  runCommand, StaticCatalogProvider, validateFurniture, type AABB, type FurnitureModel, type StaticCatalog,
} from "../src/index.js";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog-ejemplo.json", import.meta.url), "utf8")) as StaticCatalog;

/** Todas las cajas de un mueble con su nombre. */
function boxes(m: FurnitureModel): { name: string; id: string; box: AABB }[] {
  return m.panels.flatMap((p) => panelInstances(p).map((u, i) => ({ id: p.id, name: `${p.name} ${i + 1}`, box: panelBox(p, u.placement)! })));
}

/** Ninguna pieza se mete dentro de otra, salvo el fondo en su ranura de 8 mm. */
function assertNoOverlaps(m: FurnitureModel) {
  const all = boxes(m);
  for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
    if (all[a].id === "back" || all[b].id === "back") continue;
    expect(overlaps(all[a].box, all[b].box, 1), `${all[a].name} se cruza con ${all[b].name}`).toBe(false);
  }
}

function assertInside(m: FurnitureModel, extraFront = 18) {
  for (const { name, box } of boxes(m)) {
    expect(box.min[0], name).toBeGreaterThanOrEqual(0);
    expect(box.max[0], name).toBeLessThanOrEqual(m.dims.width);
    expect(box.min[1], name).toBeGreaterThanOrEqual(0);
    expect(box.max[1], name).toBeLessThanOrEqual(m.dims.height);
    expect(box.min[2], name).toBeGreaterThanOrEqual(0);
    expect(box.max[2], name).toBeLessThanOrEqual(m.dims.depth + extraFront);
  }
}

describe("closet con divisiones, barra y cajones", () => {
  const closet = () => generateCabinet({ width: 1800, height: 2200, depth: 600, dividers: 2, hangingBar: true, shelves: 3, drawers: 3, doors: 6, plinthHeight: 80, joinery: "minifix" });

  it("genera cuerpos iguales, barra en los cuerpos de colgar y cajones en el primero", () => {
    const m = closet();
    expect(m.name).toMatch(/^Closet/);
    const bayW = Math.floor((1800 - 36 - 2 * 18) / 3);
    expect(m.panels.find((p) => p.id === "divider")).toMatchObject({ qty: 2, height: 2200 - 36 - 80 });
    expect(m.panels.find((p) => p.id === "shelf")).toMatchObject({ qty: 3, height: bayW - 2 });
    expect(m.panels.find((p) => p.id === "shelf-top")).toMatchObject({ qty: 2, height: bayW });
    expect(m.fixtures!.map((f) => f.kind)).toEqual(["rod", "rod"]);
    expect(m.panels.find((p) => p.id === "drawer-side")!.qty).toBe(6);
    expect(m.panels.find((p) => p.id === "drawer-bottom")!.qty).toBe(3);
    // Con puertas, los cajones son interiores: no hay frente visible aparte.
    expect(m.panels.some((p) => p.id === "drawer-front")).toBe(false);
    expect(m.panels.at(-1)!.id).toBe("door");
    const hw = Object.fromEntries(m.hardware.map((h) => [h.category + ":" + h.id, h.qty]));
    expect(hw["slide:slide-550"]).toBe(3);
    expect(hw["rod-support:rod-support"]).toBe(4);
    expect(hw["hinge:hinge-35"]).toBe(6 * 5);
  });

  it("ninguna pieza se cruza con otra y todo queda dentro de la caja", () => {
    for (const m of [
      closet(),
      generateCabinet({ width: 800, height: 900, depth: 500, drawers: 4 }),
      generateCabinet({ width: 1200, height: 2000, depth: 550, dividers: 1, shelves: 4, drawers: 2, doors: 2 }),
      generateCabinet({ width: 900, height: 1800, depth: 600, hangingBar: true, doors: 2 }),
      generateCabinet({ width: 2400, height: 2000, depth: 350, dividers: 3, shelves: 4 }),
    ]) { assertNoOverlaps(m); assertInside(m); }
  });

  it("las puertas alternan ejes y los cajones abren sin chocar con el propio mueble", () => {
    const m = closet();
    const doors = m.panels.find((p) => p.id === "door")!.instances!;
    expect(doors.map((d) => (d.motion as { axis: string }).axis)).toEqual(["left", "right", "left", "right", "left", "right"]);
    expect(checkMotionCollisions(generateCabinet({ width: 800, height: 900, depth: 500, drawers: 4 }))).toEqual([]);
    expect(checkMotionCollisions(generateCabinet({ width: 1200, height: 2000, depth: 550, dividers: 1, shelves: 4, drawers: 2 }))).toEqual([]);
  });

  it("rechaza combinaciones que no se pueden construir", () => {
    expect(() => generateCabinet({ width: 600, height: 2000, depth: 500, dividers: 5 })).toThrow(/Demasiadas divisiones/);
    expect(() => generateCabinet({ width: 1800, height: 2200, depth: 600, dividers: 2, doors: 3 })).toThrow(/2 por cuerpo/);
    expect(() => generateCabinet({ width: 800, height: 700, depth: 500, drawers: 5 })).toThrow(/No caben/);
    expect(() => generateCabinet({ width: 800, height: 900, depth: 200, drawers: 2 })).toThrow(/correderas/);
  });

  it("avisa de barras largas y de closets poco profundos", () => {
    const codes = validateFurniture(generateCabinet({ width: 1300, height: 2000, depth: 450, hangingBar: true })).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["rod-span", "closet-shallow", "shelf-sag"]));
    expect(validateFurniture(generateCabinet({ width: 1000, height: 900, depth: 500, drawers: 3 })).map((i) => i.code)).toContain("drawer-wide");
  });
});

describe("cajonera", () => {
  it("tiene frentes visibles, tiradores y correderas, y se cotiza completa", async () => {
    const m = generateCabinet({ width: 800, height: 900, depth: 500, drawers: 4, joinery: "minifix" });
    expect(m.name).toMatch(/^Cajonera/);
    const front = m.panels.find((p) => p.id === "drawer-front")!;
    expect(front).toMatchObject({ qty: 4, height: 800 - 4, width: 198 });
    expect(front.motion).toMatchObject({ kind: "slide", direction: "front", travel: 450 });
    expect(m.hardware.find((h) => h.id === "handle")!.qty).toBe(4);
    const q = await buildQuote(m, [new StaticCatalogProvider(catalog)]);
    expect(q.missingCount).toBe(0);
    expect(q.lines.find((l) => l.category === "slide")!.qty).toBe(4);
    const plan = buildCutPlan(m);
    expect(plan.oversize).toEqual([]);
    expect(plan.sheets.flatMap((s) => s.pieces).length).toBe(m.panels.reduce((n, p) => n + p.qty, 0));
  });

  it("un cajón choca con un obstáculo frente al mueble", () => {
    const m = generateCabinet({ width: 800, height: 900, depth: 500, drawers: 4 });
    const hits = checkMotionCollisions(m, [{ id: "cama", name: "la cama", box: { min: [0, 0, 500 + 18 + 300], max: [800, 500, 2500] } }]);
    // Cuatro cajones de varias piezas cada uno: un solo aviso por obstáculo, con el primer contacto.
    expect(hits).toHaveLength(1);
    expect(hits[0].message).toMatch(/Un cajón choca con la cama a los \d+ mm de recorrido \(de 450\)/);
    // El frente llega a los 300 mm; el muestreo es cada 19 mm.
    expect(hits[0].travel).toBeGreaterThanOrEqual(300);
    expect(hits[0].travel).toBeLessThanOrEqual(320);
  });
});

describe("órdenes para closets y cajoneras", () => {
  function setup() {
    const w = createWorld("Casa");
    addRoom(w, { name: "Alcoba", width: 4000, depth: 3500, height: 2400 });
    return w;
  }

  it("crea un closet completo con una frase", () => {
    const w = setup();
    const r = runCommand(w, { kind: "wall", roomId: "alcoba", wall: "north" }, "closet de 180 x 220 x 60 con 2 divisiones, barra y 3 cajones, pegado a la izquierda");
    expect(r.ok, r.message).toBe(true);
    expect(w.items[0]).toMatchObject({ name: "Closet", offset: 0, params: { width: 1800, height: 2200, depth: 600, dividers: 2, drawers: 3, hangingBar: true } });
    expect(checkWorld(w).filter((i) => i.level === "error")).toEqual([]);
  });

  it("una cajonera sin decir cuántos cajones los reparte en la altura", () => {
    const w = setup();
    runCommand(w, { kind: "wall", roomId: "alcoba", wall: "east" }, "cajonera de 80 x 90 x 50");
    expect(w.items[0].params).toMatchObject({ width: 800, height: 900, depth: 500, drawers: 4 });
  });

  it("modifica divisiones, cajones, barra y puertas de un mueble existente", () => {
    const w = setup();
    runCommand(w, { kind: "wall", roomId: "alcoba", wall: "north" }, "armario de 1200 x 2000 x 600");
    const sel = { kind: "item" as const, itemId: "armario" };
    expect(runCommand(w, sel, "2 divisiones").message).toContain("3 cuerpos");
    runCommand(w, sel, "agrega 2 cajones");
    runCommand(w, sel, "agrega un cajón");
    runCommand(w, sel, "con barra de colgar");
    expect(w.items[0].params).toMatchObject({ dividers: 2, drawers: 3, hangingBar: true });
    expect(runCommand(w, sel, "6 puertas").ok).toBe(true);
    const bad = runCommand(w, sel, "3 puertas");
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain("2 por cuerpo");
    expect(w.items[0].params.doors).toBe(6);
    runCommand(w, sel, "quita un cajón");
    expect(w.items[0].params.drawers).toBe(2);
    runCommand(w, sel, "quita la barra");
    expect(w.items).toHaveLength(1); // quitar una parte no borra el mueble
    runCommand(w, sel, "sin cajones");
    expect(runCommand(w, sel, "sin divisiones").message).toContain("puertas ajustadas a 2");
    expect(w.items[0].params).toMatchObject({ dividers: 0, drawers: 0, hangingBar: false, doors: 2 });
  });
});
