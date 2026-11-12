import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  addRoom, buildQuote, checkWorld, createWorld, cutSheetHtml, describeWorld, exportGltf, generateFrame, getProfile, mergedModel, overlaps, placeCabinet,
  planBars, profileBySide, quoteWorld, runCommand, StaticCatalogProvider, validateFurniture, type StaticCatalog,
} from "../src/index.js";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog-ejemplo.json", import.meta.url), "utf8")) as StaticCatalog;
const providers = [new StaticCatalogProvider(catalog)];

describe("perfiles", () => {
  it("calcula el peso por metro desde la sección", () => {
    // 40x40x1,5: (1600 - 37²) mm² x 7,85 g/cm³ = 1,81 kg/m
    expect(getProfile("tubo-40x40x1.5").kgPerM).toBeCloseTo(1.81, 2);
    expect(profileBySide(25).id).toBe("tubo-25x25x1.5");
    expect(profileBySide(45).a).toBe(40);
    expect(() => getProfile("tubo-99")).toThrow(/No conozco el perfil/);
  });
});

describe("generateFrame", () => {
  it("mesa: 4 patas, marco superior e inferior y cubierta", () => {
    const m = generateFrame({ type: "table", width: 1200, height: 750, depth: 600 });
    const post = m.bars!.find((b) => b.id === "post")!;
    expect(post).toMatchObject({ qty: 4, length: 750 - 18 });
    expect(m.bars!.find((b) => b.id === "rail-long")).toMatchObject({ qty: 4, length: 1200 - 80 });
    expect(m.bars!.find((b) => b.id === "rail-short")).toMatchObject({ qty: 4, length: 600 - 80 });
    expect(m.panels).toHaveLength(1);
    expect(m.panels[0]).toMatchObject({ id: "deck", name: "Cubierta", height: 1200, width: 600, qty: 1 });
    expect(m.panels[0].placement!.y).toBe(732);
    // Las barras no se cruzan entre sí.
    const boxes = m.bars!.flatMap((b) => b.boxes);
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) expect(overlaps(boxes[a], boxes[b], 1)).toBe(false);
  });

  it("estantería: un marco y un entrepaño por nivel", () => {
    const m = generateFrame({ type: "shelving", width: 1000, height: 2000, depth: 400, levels: 5, profileId: "tubo-25x25x1.5" });
    expect(m.bars!.find((b) => b.id === "rail-long")!.qty).toBe(10);
    expect(m.panels[0]).toMatchObject({ name: "Entrepaño", qty: 5 });
    const ys = m.panels[0].instances!.map((i) => i.placement.y);
    expect(ys[0]).toBe(125);
    expect(ys.at(-1)).toBe(2000 - 18);
    expect((m.meta as { steelKg: number }).steelKg).toBeGreaterThan(20);
  });

  it("atornillada cambia soldadura por conectores; sin tablero no lleva piezas de madera", () => {
    const weld = generateFrame({ type: "table", width: 1200, height: 750, depth: 600 });
    expect(weld.hardware.map((h) => h.category)).toContain("welding-rod");
    const bolt = generateFrame({ type: "table", width: 1200, height: 750, depth: 600, joint: "bolt", top: false });
    expect(bolt.hardware.find((h) => h.category === "tube-connector")!.qty).toBe(16);
    expect(bolt.panels).toEqual([]);
    expect(bolt.bars!.find((b) => b.id === "post")!.length).toBe(750);
  });

  it("avisa de travesaños largos y de estructuras que se pueden volcar; rechaza medidas imposibles", () => {
    expect(validateFurniture(generateFrame({ type: "table", width: 2400, height: 750, depth: 600, profileId: "tubo-25x25x1.5" })).map((i) => i.code)).toContain("rail-span");
    expect(validateFurniture(generateFrame({ type: "shelving", width: 800, height: 2000, depth: 300 })).map((i) => i.code)).toContain("tip-over");
    expect(validateFurniture(generateFrame({ type: "table", width: 1200, height: 750, depth: 600 }))).toEqual([]);
    expect(() => generateFrame({ type: "table", width: 100, height: 750, depth: 600 })).toThrow(/Medidas inválidas/);
    expect(() => generateFrame({ type: "shelving", width: 1000, height: 600, depth: 400, levels: 6 })).toThrow(/niveles/);
  });
});

describe("planBars", () => {
  it("corta todas las piezas en las menos barras de 6 m posibles", () => {
    const m = generateFrame({ type: "table", width: 1200, height: 750, depth: 600 });
    const plan = planBars(m.bars!);
    const cuts = plan.stock.flatMap((s) => s.cuts);
    expect(cuts).toHaveLength(12);
    // 4 x 732 + 4 x 1120 + 4 x 520 = 9,488 m → 2 barras
    expect(plan.totals[0]).toMatchObject({ bars: 2, meters: 9.49 });
    for (const s of plan.stock) {
      const used = s.cuts.reduce((a, c) => a + c.length, 0) + (s.cuts.length - 1) * plan.kerf;
      expect(used + s.leftover).toBe(6000);
      expect(s.leftover).toBeGreaterThanOrEqual(0);
    }
    expect(plan.totalKg).toBeCloseTo(9.488 * 1.81, 0);
  });

  it("reporta piezas más largas que la barra", () => {
    const plan = planBars([{ id: "x", name: "Viga", profileId: "tubo-50x50x2", length: 6500, qty: 1, boxes: [] }]);
    expect(plan.oversize).toHaveLength(1);
    expect(plan.totals[0].bars).toBe(0);
  });
});

describe("estructuras en el mundo", () => {
  function setup() {
    const w = createWorld("Casa");
    addRoom(w, { name: "Taller", width: 4000, depth: 3000 });
    return w;
  }

  it("se colocan, se describen, se cotizan con el acero y se exportan", async () => {
    const w = setup();
    const item = placeCabinet(w, { roomId: "taller", wall: "north", offset: 500, params: { width: 1200, height: 750, depth: 600 }, frame: { type: "table" } });
    expect(item).toMatchObject({ kind: "frame", name: "Mesa de tubo" });
    expect(describeWorld(w)).toMatch(/Mesa de tubo \(id: mesa-de-tubo\): estructura de tubo 1200 x 750 x 600.*perfil tubo-40x40x1\.5.*soldada, con tablero/);
    expect(checkWorld(w)).toEqual([]);
    const q = await buildQuote(mergedModel(w), providers);
    expect(q.missingCount).toBe(0);
    expect(q.lines.find((l) => l.category === "steel-profile")).toMatchObject({ qty: 2, unitPrice: 16 });
    expect(q.lines.find((l) => l.category === "board")!.qty).toBe(1);
    expect((await quoteWorld(w, providers)).subtotal).toBe(q.subtotal);
    const html = cutSheetHtml(mergedModel(w), w.name);
    expect(html).toContain("Perfiles metálicos");
    expect(html).toMatch(/2<\/strong> barra\(s\) de 6 m de Tubo cuadrado 40 x 40/);
    const g = JSON.parse(exportGltf(w));
    expect(g.nodes.filter((n: { name: string }) => n.name.startsWith("Pata")).length).toBe(4);
  });

  it("se crean y se editan con órdenes en español", () => {
    const w = setup();
    const wall = { kind: "wall" as const, roomId: "taller", wall: "east" as const };
    const r = runCommand(w, wall, "mesa de tubo de 120 x 75 x 60 a 50 cm de la izquierda");
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toMatch(/Mesa de tubo de 1200 x 750 x 600 mm en tubo-40x40x1\.5, \d+,\d kg de acero/);
    expect(w.items[0]).toMatchObject({ kind: "frame", offset: 500, frame: { type: "table" } });
    runCommand(w, { kind: "wall", roomId: "taller", wall: "north" }, "estantería metálica de 100 x 200 x 40 con 5 niveles en tubo de 25, atornillada");
    expect(w.items[1]).toMatchObject({ kind: "frame", name: "Estantería de tubo", frame: { type: "shelving", levels: 5, profileId: "tubo-25x25x1.5", joint: "bolt" } });

    const sel = { kind: "item" as const, itemId: "mesa-de-tubo" };
    expect(runCommand(w, sel, "tubo de 50").message).toContain("tubo-50x50x2");
    runCommand(w, sel, "sin tablero");
    runCommand(w, sel, "atornillada");
    expect(w.items[0].frame).toMatchObject({ profileId: "tubo-50x50x2", top: false, joint: "bolt" });
    runCommand(w, sel, "ensancha 20 cm");
    expect(w.items[0].params.width).toBe(1400);
    const no = runCommand(w, sel, "agrega un cajón");
    expect(no.ok).toBe(false);
    expect(no.message).toContain("estructura de tubo");
    // Un closet con "tubo" sigue siendo un closet con barra, no una estructura.
    runCommand(w, { kind: "wall", roomId: "taller", wall: "south" }, "closet de 120 x 200 x 60 con tubo");
    expect(w.items[2]).toMatchObject({ kind: "cabinet", params: { hangingBar: true } });
  });
});
