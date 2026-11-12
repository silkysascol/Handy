import { describe, expect, it } from "vitest";
import { addOpening, addRoom, createWorld, dimensionsFor, placeCabinet, snapAlongWall, wallCoord, wallPoint, type WallSide } from "../src/index.js";

function setup() {
  const w = createWorld("Casa");
  const room = addRoom(w, { name: "Sala", width: 4000, depth: 3000, height: 2400, origin: [500, 200] });
  addOpening(w, room.id, { wall: "north", type: "door", offset: 3000, width: 800, height: 2050 });
  placeCabinet(w, { roomId: room.id, wall: "north", offset: 1000, name: "Armario", params: { width: 800, height: 2000, depth: 500, doors: 2 } });
  return { w, room };
}

describe("wallPoint y wallCoord", () => {
  it("son inversas en los cuatro muros", () => {
    const { room } = setup();
    for (const wall of ["north", "east", "south", "west"] as WallSide[]) {
      const [x, , z] = wallPoint(room, wall, 700, 0, 150);
      expect(wallCoord(room, wall, x, z)).toEqual({ u: 700, inset: 150 });
    }
    expect(wallPoint(room, "north", 0, 0, 0)).toEqual([500, 0, 200]);
    expect(wallPoint(room, "south", 0, 0, 0)).toEqual([4500, 0, 3200]);
  });
});

describe("dimensionsFor", () => {
  it("un mueble muestra su ancho, su alto y lo que queda a cada lado", () => {
    const { w } = setup();
    const dims = dimensionsFor(w, { kind: "item", itemId: "armario" });
    expect(dims.map((d) => [d.kind, d.value])).toEqual([["gap", 1000], ["size", 800], ["gap", 2200], ["size", 2000]]);
    // La cota del ancho va paralela al muro, delante del mueble (fondo 500 + puerta 18 + 120).
    const width = dims[1];
    expect(width.from[2]).toBe(200 + 518 + 120);
    expect(width.to[0] - width.from[0]).toBe(800);
  });

  it("una abertura, un muro y una habitación tienen sus cotas", () => {
    const { w } = setup();
    expect(dimensionsFor(w, { kind: "opening", roomId: "sala", openingId: "door-north" }).map((d) => d.value)).toEqual([3000, 800, 200, 2050]);
    expect(dimensionsFor(w, { kind: "wall", roomId: "sala", wall: "east" }).map((d) => d.value)).toEqual([3000, 2400]);
    expect(dimensionsFor(w, { kind: "room", roomId: "sala" }).map((d) => d.value)).toEqual([4000, 3000, 2400]);
    expect(dimensionsFor(w, { kind: "world" })).toEqual([]);
  });
});

describe("snapAlongWall", () => {
  it("redondea a la rejilla y no deja salir del muro", () => {
    const { w } = setup();
    expect(snapAlongWall(w, "sala", "east", 600, 1234)).toBe(1230);
    expect(snapAlongWall(w, "sala", "east", 600, -300)).toBe(0);
    expect(snapAlongWall(w, "sala", "east", 600, 9000)).toBe(2400);
  });

  it("se imanta a los extremos y a los bordes de vecinos y aberturas", () => {
    const { w } = setup();
    // Otro mueble de 600 arrastrado cerca del armario (1000 a 1800) y de la puerta (3000 a 3800).
    expect(snapAlongWall(w, "sala", "north", 600, 1825)).toBe(1800); // pegado a la derecha del armario
    expect(snapAlongWall(w, "sala", "north", 600, 372)).toBe(400); // su borde derecho toca el armario
    expect(snapAlongWall(w, "sala", "north", 600, 2415)).toBe(2400); // su borde derecho toca la puerta
    expect(snapAlongWall(w, "sala", "north", 600, 22)).toBe(0);
    // Al mover el propio armario no se imanta a sí mismo.
    expect(snapAlongWall(w, "sala", "north", 800, 1013, { itemId: "armario" })).toBe(1010);
  });
});
