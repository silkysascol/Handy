import { describe, expect, it } from "vitest";
import { addOpening, addRoom, checkWorld, createWorld, describeWorld, exportGltf, freeWallRuns, itemBox, itemTransform, mergedModel, placeCabinet, buildCutlist } from "../src/index.js";

function demo() {
  const w = createWorld("Casa de prueba");
  const room = addRoom(w, { name: "Dormitorio", width: 3600, depth: 3200, height: 2400, wallThickness: 150 });
  addOpening(w, room.id, { wall: "south", type: "door", offset: 200, width: 800, height: 2050 });
  addOpening(w, room.id, { wall: "north", type: "window", offset: 1200, width: 1200, height: 1200, sill: 1000 });
  return { w, room };
}

describe("mundo", () => {
  it("crea habitación con ids legibles y aberturas", () => {
    const { w, room } = demo();
    expect(room.id).toBe("dormitorio");
    expect(room.openings.map((o) => o.id)).toEqual(["door-south", "window-north"]);
    expect(() => addOpening(w, room.id, { wall: "east", type: "door", offset: 3000, width: 800, height: 2050 })).toThrow();
  });

  it("coloca muebles contra cada muro con la orientación correcta", () => {
    const { w, room } = demo();
    const params = { width: 800, height: 2000, depth: 500, doors: 2 as const };
    const east = placeCabinet(w, { roomId: room.id, wall: "east", offset: 1000, name: "Armario", params });
    expect(itemTransform(room, east)).toEqual({ position: [3600, 0, 1000], rotationY: 270 });
    const box = itemBox(room, east);
    expect(box.min).toEqual([3600 - 518, 0, 1000]);
    expect(box.max).toEqual([3600, 2000, 1800]);
    const west = placeCabinet(w, { roomId: room.id, wall: "west", offset: 0, name: "Estante", params: { width: 600, height: 900, depth: 300 } });
    expect(itemBox(room, west)).toEqual({ min: [0, 0, 2600], max: [300, 900, 3200] });
    expect(() => placeCabinet(w, { roomId: room.id, wall: "north", offset: 3000, params })).toThrow(/No cabe/);
  });

  it("calcula tramos libres descontando puerta, ventana tapada y muebles", () => {
    const { w, room } = demo();
    placeCabinet(w, { roomId: room.id, wall: "east", offset: 1000, name: "Armario", params: { width: 800, height: 2000, depth: 500 } });
    const low = freeWallRuns(w, room.id, { height: 900, minLength: 300 });
    expect(low.filter((r) => r.wall === "north")).toEqual([{ wall: "north", from: 0, to: 3600, length: 3600 }]);
    expect(low.filter((r) => r.wall === "south").map((r) => [r.from, r.to])).toEqual([[1000, 3600]]);
    expect(low.filter((r) => r.wall === "east").map((r) => [r.from, r.to])).toEqual([[0, 1000], [1800, 3200]]);
    const tall = freeWallRuns(w, room.id, { height: 2000, minLength: 300 });
    expect(tall.filter((r) => r.wall === "north").map((r) => [r.from, r.to])).toEqual([[0, 1200], [2400, 3600]]);
  });

  it("detecta puerta de mueble contra el muro de la esquina, puerta tapada y solapes", () => {
    const { w, room } = demo();
    placeCabinet(w, { roomId: room.id, wall: "east", offset: 0, name: "Esquinero", params: { width: 600, height: 700, depth: 350, doors: 1 } });
    let codes = checkWorld(w).map((i) => i.code);
    expect(codes).toContain("motion-collision");
    expect(checkWorld(w).find((i) => i.code === "motion-collision")!.message).toContain("muro norte");

    placeCabinet(w, { roomId: room.id, wall: "south", offset: 0, name: "Zapatero", params: { width: 600, height: 900, depth: 300 } });
    codes = checkWorld(w).map((i) => i.code);
    expect(codes).toContain("blocks-door");

    placeCabinet(w, { roomId: room.id, wall: "north", offset: 3200, name: "Torre", params: { width: 400, height: 2000, depth: 500 } });
    expect(checkWorld(w).map((i) => i.code)).toContain("items-overlap");
  });

  it("un mueble bien ubicado no genera avisos", () => {
    const { w, room } = demo();
    placeCabinet(w, { roomId: room.id, wall: "east", offset: 1000, name: "Armario", params: { width: 800, height: 2000, depth: 500, doors: 2, shelves: 3, joinery: "minifix" } });
    expect(checkWorld(w)).toEqual([]);
  });

  it("describe el mundo en texto y consolida materiales", () => {
    const { w, room } = demo();
    placeCabinet(w, { roomId: room.id, wall: "east", offset: 1000, name: "Armario", params: { width: 800, height: 2000, depth: 500, doors: 2 } });
    placeCabinet(w, { roomId: room.id, wall: "west", offset: 0, name: "Estante", params: { width: 600, height: 900, depth: 300, shelves: 2 } });
    const text = describeWorld(w);
    expect(text).toContain("Dormitorio (id: dormitorio) · 3600 x 3200");
    expect(text).toContain("Armario (id: armario)");
    expect(text).toContain("Tramos libres");
    const cut = buildCutlist(mergedModel(w));
    expect(cut.rows.some((r) => r.name.startsWith("Estante · "))).toBe(true);
    expect(cut.materials.find((m) => m.materialId === "melamine-18-white")!.sheetsEstimate).toBeGreaterThanOrEqual(2);
  });

  it("exporta glTF válido en estructura, en metros y con jerarquía legible", () => {
    const { w, room } = demo();
    placeCabinet(w, { roomId: room.id, wall: "east", offset: 1000, name: "Armario", params: { width: 800, height: 2000, depth: 500, doors: 2, shelves: 3 } });
    const g = JSON.parse(exportGltf(w));
    expect(g.asset.version).toBe("2.0");
    const names: string[] = g.nodes.map((n: { name: string }) => n.name);
    expect(names).toEqual(expect.arrayContaining(["Handy · Casa de prueba", "Dormitorio", "Muros", "Piso", "Muebles", "Armario", "Costado izquierdo", "Repisa 3", "Puerta (par) 2"]));
    const armario = g.nodes.find((n: { name: string }) => n.name === "Armario");
    expect(armario.translation).toEqual([3.6, 0, 1]);
    expect(armario.rotation[1]).toBeCloseTo(Math.sin((270 * Math.PI) / 360), 5);
    // La ventana parte el muro norte en 4 rectángulos y la puerta el sur en 3.
    expect(names.filter((n) => n.startsWith("muro norte")).length).toBe(4);
    expect(names.filter((n) => n.startsWith("muro sur")).length).toBe(3);
    const buf = g.buffers[0];
    expect(buf.uri.startsWith("data:application/octet-stream;base64,")).toBe(true);
    expect(Buffer.from(buf.uri.split(",")[1], "base64").length).toBe(buf.byteLength);
    for (const n of g.nodes) for (const c of n.children ?? []) expect(c).toBeLessThan(g.nodes.length);
  });
});
