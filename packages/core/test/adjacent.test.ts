import { describe, expect, it } from "vitest";
import {
  addOpening, addRoom, adjacentWall, attachRoom, checkWorld, createWorld, describeWorld, effectiveOpenings, exportGltf, freeWallRuns, placeCabinet,
  runCommand, wallPoint, type WallSide,
} from "../src/index.js";

function house() {
  const w = createWorld("Casa");
  addRoom(w, { name: "Sala", width: 4000, depth: 3000, height: 2400, wallThickness: 150 });
  return w;
}

describe("habitaciones contiguas", () => {
  it("la habitación pegada comparte el muro: de su lado no tiene grosor", () => {
    const w = house();
    const cocina = attachRoom(w, { name: "Cocina", width: 2800, depth: 2400, to: "sala", side: "east" });
    expect(cocina.origin).toEqual([4000 + 150, 0]);
    expect(cocina.wallThickness).toMatchObject({ west: 0, east: 150, north: 150, south: 150 });
    expect(adjacentWall(w, cocina, "west")).toMatchObject({ room: { id: "sala" }, wall: "east" });
    expect(adjacentWall(w, w.rooms[0], "east")).toMatchObject({ room: { id: "cocina" }, wall: "west" });
    expect(adjacentWall(w, w.rooms[0], "north")).toBeNull();
    expect(() => attachRoom(w, { name: "Otra", width: 2000, depth: 2000, to: "cocina", side: "west" })).toThrow(/ya es compartido/);
  });

  it("se pega por los cuatro lados y con desplazamiento", () => {
    for (const [side, origin] of [["east", [4150, 500]], ["west", [-150 - 2000, 500]], ["south", [500, 3150]], ["north", [500, -150 - 1800]]] as [WallSide, number[]][]) {
      const w = house();
      const r = attachRoom(w, { name: "B", width: 2000, depth: 1800, to: "sala", side, shift: 500 });
      expect(r.origin, side).toEqual(origin);
      expect(adjacentWall(w, r, { east: "west", west: "east", south: "north", north: "south" }[side] as WallSide)?.room.id, side).toBe("sala");
    }
  });

  it("una puerta en el muro compartido se ve desde los dos lados, en el mismo punto del mundo", () => {
    // La "izquierda" de cada muro es distinta; estos offsets dejan la puerta en el mismo tramo (700 a 1500 del eje).
    for (const [side, doorOffset] of [["east", 700], ["west", 1500], ["south", 2500], ["north", 700]] as [WallSide, number][]) {
      const w = house();
      const b = attachRoom(w, { name: "B", width: 2000, depth: 1800, to: "sala", side, shift: 400 });
      const sala = w.rooms[0];
      addOpening(w, "sala", { wall: side, type: "door", offset: doorOffset, width: 800, height: 2050 });
      const facing = adjacentWall(w, sala, side)!.wall;
      const seen = effectiveOpenings(w, b, facing);
      expect(seen, side).toHaveLength(1);
      expect(seen[0]).toMatchObject({ width: 800, ownerRoomId: "sala", wall: facing });
      // Los dos extremos de la puerta coinciden sobre el eje del muro, mirados desde cada habitación.
      const along = side === "east" || side === "west" ? 2 : 0;
      const fromSala = [wallPoint(sala, side, doorOffset, 0, 0)[along], wallPoint(sala, side, doorOffset + 800, 0, 0)[along]].sort((x, y) => x - y);
      expect(fromSala, side).toEqual([700, 1500]);
      const fromB = [wallPoint(b, facing, seen[0].offset, 0, 0)[along], wallPoint(b, facing, seen[0].offset + 800, 0, 0)[along]].sort((x, y) => x - y);
      expect(fromB, side).toEqual(fromSala);
      // Y bloquea los tramos libres del lado de B.
      const runs = freeWallRuns(w, b.id, { height: 900 }).filter((r) => r.wall === facing);
      expect(runs.some((r) => r.from < seen[0].offset + 800 && r.to > seen[0].offset), side).toBe(false);
    }
  });

  it("un mueble que tapa la puerta de la vecina se detecta, y su puerta choca con el muro compartido", () => {
    const w = house();
    attachRoom(w, { name: "Cocina", width: 2800, depth: 2400, to: "sala", side: "east" });
    addOpening(w, "sala", { wall: "east", type: "door", offset: 300, width: 800, height: 2050 });
    // Del lado de la cocina, la puerta queda de 1300 a 2100 del muro oeste.
    expect(effectiveOpenings(w, w.rooms[1], "west")[0]).toMatchObject({ offset: 2400 - 300 - 800, width: 800 });
    placeCabinet(w, { roomId: "cocina", wall: "west", offset: 1400, name: "Alacena", params: { width: 600, height: 2000, depth: 350 } });
    expect(checkWorld(w).map((i) => i.code)).toContain("blocks-door");
  });

  it("la puerta de un mueble choca con el muro compartido aunque de ese lado no tenga grosor", () => {
    const w = house();
    attachRoom(w, { name: "Cocina", width: 2800, depth: 2400, to: "sala", side: "east" });
    placeCabinet(w, { roomId: "cocina", wall: "north", offset: 0, name: "Esquinero", params: { width: 600, height: 700, depth: 350, doors: 1 } });
    const hits = checkWorld(w).filter((i) => i.code === "motion-collision");
    expect(hits).toHaveLength(1);
    expect(hits[0].message).toMatch(/Puerta choca con muro oeste al abrir 9\d°/);
  });

  it("el muro compartido se describe y se exporta una sola vez, con el hueco de la puerta", () => {
    const w = house();
    attachRoom(w, { name: "Cocina", width: 2800, depth: 2400, to: "sala", side: "east" });
    addOpening(w, "cocina", { wall: "west", type: "door", offset: 500, width: 800, height: 2050 });
    const text = describeWorld(w);
    expect(text).toContain("muro este (east): largo 3000, grosor 150, compartido con Cocina (su muro oeste); puerta 800x2050 en 1100–1900 (id door-west, guardada en cocina)");
    expect(text).toContain("muro oeste (west): largo 2400, grosor 0, compartido con Sala (su muro este); puerta 800x2050 en 500–1300");
    const names: string[] = JSON.parse(exportGltf(w)).nodes.map((n: { name: string }) => n.name);
    // El muro este de la sala queda partido en 3 por la puerta de la cocina; el oeste de la cocina no se dibuja.
    expect(names.filter((n) => n.startsWith("muro este")).length).toBe(3 + 1);
    expect(names.filter((n) => n.startsWith("muro oeste")).length).toBe(1);
  });
});

describe("órdenes para habitaciones contiguas", () => {
  it("crea una habitación pegada a otra por su nombre y punto cardinal", () => {
    const w = house();
    const r = runCommand(w, { kind: "world" }, "cocina de 2,8 x 2,4 al este de la sala");
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toContain("al este de Sala, compartiendo su muro este");
    expect(w.rooms[1]).toMatchObject({ id: "cocina", name: "Cocina", width: 2800, depth: 2400, height: 2400, origin: [4150, 0] });
    expect(w.rooms[1].wallThickness.west).toBe(0);
    runCommand(w, { kind: "world" }, "baño de 1,5 x 2,2 al sur de la cocina desplazado 50 cm");
    expect(w.rooms[2]).toMatchObject({ id: "bano", name: "Baño", origin: [4150 + 500, 2400 + 150] });
    runCommand(w, { kind: "world" }, "estudio al oeste de la sala de 3 x 3");
    expect(w.rooms[3]).toMatchObject({ name: "Estudio", width: 3000, origin: [-150 - 3000, 0] });
    expect(runCommand(w, { kind: "world" }, "patio de 3 x 3 al norte del garaje")).toMatchObject({ ok: false, understood: true });
    expect(w.rooms).toHaveLength(4);
  });
});
