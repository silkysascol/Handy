import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { addRoom, createWorld, defaultFloorSpec, describeWorld, placeCabinet, planFloor, quoteWorld, runCommand, StaticCatalogProvider, type StaticCatalog } from "../src/index.js";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog-ejemplo.json", import.meta.url), "utf8")) as StaticCatalog;
const room = (width: number, depth: number) => ({ width, depth, openings: [] });

describe("planFloor", () => {
  it("habitación que calza exacto: solo piezas enteras", () => {
    // 5 piezas de 600 + 4 juntas de 3 = 3012; 4 piezas + 3 juntas = 2409
    const plan = planFloor(room(3012, 2409), defaultFloorSpec({ joint: 3, start: "corner" }));
    expect(plan.fullTiles).toBe(20);
    expect(plan.cutTiles).toBe(0);
    expect(plan.tilesNeeded).toBe(20);
    expect(plan.tilesToBuy).toBe(21); // 5 % de reserva
  });

  it("el arranque centrado deja cortes iguales en bordes opuestos y cubre toda el área", () => {
    const plan = planFloor(room(3600, 3200), defaultFloorSpec({ material: "porcelain" }));
    const covered = plan.tiles.reduce((a, t) => a + t.w * t.d, 0);
    const joints = 3600 * 3200 - covered;
    expect(joints).toBeGreaterThan(0);
    expect(joints / (3600 * 3200)).toBeLessThan(0.02);
    const left = plan.tiles.filter((t) => t.x === 0).map((t) => t.w), right = plan.tiles.filter((t) => t.x + t.w === 3600).map((t) => t.w);
    expect(new Set(left).size).toBe(1);
    expect(left[0]).toBe(right[0]);
    for (const t of plan.tiles) { expect(t.x).toBeGreaterThanOrEqual(0); expect(t.x + t.w).toBeLessThanOrEqual(3600); expect(t.z + t.d).toBeLessThanOrEqual(3200); }
  });

  it("empareja recortes: dos cortes pequeños salen de una baldosa", () => {
    // Ancho 2600 desde la esquina con pieza 600 y junta 0: 4 enteras y un corte de 200 por fila.
    const plan = planFloor(room(2600, 2400), defaultFloorSpec({ joint: 0, start: "corner" }));
    expect(plan.fullTiles).toBe(16);
    expect(plan.cutTiles).toBe(4);
    expect(plan.tilesNeeded).toBe(18); // 4 cortes de 200 salen de 2 baldosas
  });

  it("calcula pega y boquilla según formato y material", () => {
    const ceramic = planFloor(room(3000, 3000), defaultFloorSpec({ material: "ceramic", tileWidth: 300, tileLength: 300 }));
    expect(ceramic.adhesive).toMatchObject({ type: "estándar", kgPerM2: 4 });
    expect(ceramic.adhesive.bags25).toBe(2); // 9 m² x 4 kg x 1,05 = 37,8 kg
    const porcelain = planFloor(room(3000, 3000), defaultFloorSpec({ material: "porcelain", tileWidth: 600, tileLength: 600 }));
    expect(porcelain.adhesive).toMatchObject({ type: "flexible para porcelanato", kgPerM2: 5.5 });
    // (600+600)/(600*600) x 9 x 2 x 1,6 = 0,096 kg/m²
    expect(porcelain.grout.kgPerM2).toBeCloseTo(0.096, 3);
    expect(porcelain.grout.bags2).toBe(1);
    expect(porcelain.skirtingM).toBe(12);
  });

  it("trabado usa más reserva y avisa en piezas largas", () => {
    const plan = planFloor(room(3600, 3200), defaultFloorSpec({ material: "porcelain", tileWidth: 200, tileLength: 1200, pattern: "brick" }));
    expect(plan.reservePct).toBe(10);
    expect(plan.notes.join(" ")).toContain("un tercio");
  });
});

describe("piso en el mundo", () => {
  function setup() {
    const w = createWorld("Casa");
    addRoom(w, { name: "Sala", width: 3600, depth: 3200 });
    return w;
  }

  it("se define con una orden sobre la habitación y se modifica igual", () => {
    const w = setup();
    const sel = { kind: "room" as const, roomId: "sala" };
    const r = runCommand(w, sel, "piso de porcelanato 60 x 60");
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/porcelanato 600 x 600 mm.*Necesitas \d+ piezas \(\d+,\d m²/);
    expect(w.rooms[0].floor).toMatchObject({ material: "porcelain", tileWidth: 600, tileLength: 600, joint: 2, pattern: "straight" });
    expect(w.rooms[0].width).toBe(3600); // no confunde las medidas de la pieza con las de la habitación
    runCommand(w, sel, "junta 3");
    runCommand(w, sel, "trabado a un tercio desde la esquina");
    expect(w.rooms[0].floor).toMatchObject({ joint: 3, pattern: "brick", start: "corner" });
    expect(w.rooms[0].floor!.brickOffset).toBeCloseTo(1 / 3);
    expect(describeWorld(w)).toContain("Piso: porcelanato 600 x 600");
    runCommand(w, sel, "quita el piso");
    expect(w.rooms[0].floor).toBeUndefined();
    expect(runCommand(w, sel, "piso de cerámica").ok).toBe(false);
  });

  it("la cotización del mundo suma muebles y pisos", async () => {
    const w = setup();
    placeCabinet(w, { roomId: "sala", wall: "north", offset: 0, name: "Estante", params: { width: 600, height: 900, depth: 300, shelves: 2 } });
    const providers = [new StaticCatalogProvider(catalog)];
    const before = await quoteWorld(w, providers);
    expect(before.groups.floors).toBe(0);
    runCommand(w, { kind: "room", roomId: "sala" }, "piso de porcelanato 60 x 60");
    const q = await quoteWorld(w, providers);
    expect(q.groups.furniture).toBe(before.groups.furniture);
    expect(q.groups.floors).toBeGreaterThan(100);
    expect(q.missingCount).toBe(0);
    const tile = q.lines.find((l) => l.category === "tile")!;
    expect(tile.description).toContain("Sala · Porcelanato 60 x 60 cm (caja de 4)");
    expect(tile.qty).toBe(Math.ceil(planFloor(w.rooms[0], w.rooms[0].floor!).tilesToBuy / 4));
    // Un formato que el catálogo no tiene queda como faltante, no inventado.
    runCommand(w, { kind: "room", roomId: "sala" }, "piso de cerámica 33 x 33");
    const q2 = await quoteWorld(w, providers);
    expect(q2.lines.find((l) => l.category === "tile")!.missing).toBe(true);
  });
});
