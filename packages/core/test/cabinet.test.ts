import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { generateCabinet, buildCutlist, validateFurniture, buildQuote, StaticCatalogProvider, type StaticCatalog } from "../src/index.js";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog-ejemplo.json", import.meta.url), "utf8")) as StaticCatalog;

describe("generateCabinet", () => {
  it("genera las piezas de un gabinete básico con 2 puertas", () => {
    const m = generateCabinet({ width: 800, height: 2000, depth: 500, shelves: 3, doors: 2 });
    const ids = m.panels.map((p) => p.id);
    expect(ids).toEqual(["side-left", "side-right", "top", "bottom", "back", "shelf", "door"]);
    const top = m.panels.find((p) => p.id === "top")!;
    expect(top.height).toBe(800 - 36);
    const door = m.panels.find((p) => p.id === "door")!;
    expect(door.width).toBe(Math.floor((800 - 6) / 2));
    expect(door.height).toBe(2000 - 4);
    expect(door.qty).toBe(2);
    const hinges = m.hardware.find((h) => h.category === "hinge")!;
    expect(hinges.qty).toBe(8); // 4 por puerta hasta 2000 mm
  });

  it("asigna movimiento de bisagra a las puertas", () => {
    const m = generateCabinet({ width: 800, height: 2000, depth: 500, doors: 2 });
    const door = m.panels.find((p) => p.id === "door")!;
    expect(door.motion).toEqual({ kind: "hinge", axis: "left", maxAngleDeg: 110, softClose: false });
    expect(m.panels.find((p) => p.id === "shelf")?.motion).toBeUndefined();
  });

  it("usa minifix cuando se pide unión oculta", () => {
    const m = generateCabinet({ width: 600, height: 700, depth: 350, joinery: "minifix" });
    expect(m.hardware.some((h) => h.category === "cam-lock")).toBe(true);
    expect(m.hardware.some((h) => h.category === "confirmat")).toBe(false);
  });

  it("rechaza medidas imposibles", () => {
    expect(() => generateCabinet({ width: 20, height: 500, depth: 300 })).toThrow();
  });
});

describe("buildCutlist", () => {
  it("suma área y metros de tapacanto", () => {
    const m = generateCabinet({ width: 800, height: 2000, depth: 500, shelves: 2, doors: 0 });
    const c = buildCutlist(m);
    const mel = c.materials.find((x) => x.materialId === "melamine-18-white")!;
    expect(mel.areaM2).toBeGreaterThan(3);
    expect(mel.sheetsEstimate).toBeGreaterThanOrEqual(1);
    const sides = c.rows.find((r) => r.name === "Costado izquierdo")!;
    expect(sides.edges).toBe("1L");
    expect(sides.edgeBandMeters).toBe(2);
  });
});

describe("validateFurniture", () => {
  it("avisa de repisas largas y puertas anchas", () => {
    const m = generateCabinet({ width: 1200, height: 900, depth: 400, shelves: 1, doors: 1 });
    const codes = validateFurniture(m).map((i) => i.code);
    expect(codes).toContain("shelf-sag");
    expect(codes).toContain("door-too-wide");
  });
});

describe("buildQuote", () => {
  it("cotiza con el catálogo de ejemplo sin ítems faltantes", async () => {
    const m = generateCabinet({ width: 800, height: 2000, depth: 500, shelves: 3, doors: 2, plinthHeight: 80 });
    const q = await buildQuote(m, [new StaticCatalogProvider(catalog)]);
    expect(q.currency).toBe("USD");
    expect(q.missingCount).toBe(0);
    expect(q.subtotal).toBeGreaterThan(50);
    const boards = q.lines.filter((l) => l.category === "board");
    expect(boards.length).toBe(2);
  });

  it("marca líneas sin precio cuando el catálogo no tiene el ítem", async () => {
    const m = generateCabinet({ width: 600, height: 700, depth: 350, joinery: "pocket-screw" });
    const q = await buildQuote(m, [new StaticCatalogProvider(catalog)]);
    expect(q.lines.find((l) => l.category === "pocket-screw")!.missing).toBe(true);
    expect(q.missingCount).toBe(1);
  });
});
