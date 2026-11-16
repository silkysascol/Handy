import type { Millimeters } from "./model/index.js";
import type { Selection } from "./commands.js";
import { frontDepth, getRoom, itemBox, roomSpan, wallLength, type Room, type WallSide, type World } from "./world.js";

type Vec3 = [number, number, number];

/** Punto del mundo a `u` mm del extremo izquierdo de un muro (mirándolo desde dentro), a altura `y` y `inset` mm hacia el interior. */
export function wallPoint(room: Room, wall: WallSide, u: Millimeters, y: Millimeters, inset: Millimeters): Vec3 {
  const [ox, oz] = room.origin;
  switch (wall) {
    case "north": return [ox + u, y, oz + inset];
    case "south": return [ox + room.width - u, y, oz + room.depth - inset];
    case "east": return [ox + room.width - inset, y, oz + u];
    case "west": return [ox + inset, y, oz + room.depth - u];
  }
}

/** Inversa de `wallPoint`: a qué distancia del extremo izquierdo y a cuánto del muro cae un punto del plano. */
export function wallCoord(room: Room, wall: WallSide, x: number, z: number): { u: number; inset: number } {
  const [ox, oz] = room.origin;
  switch (wall) {
    case "north": return { u: x - ox, inset: z - oz };
    case "south": return { u: ox + room.width - x, inset: oz + room.depth - z };
    case "east": return { u: z - oz, inset: ox + room.width - x };
    case "west": return { u: oz + room.depth - z, inset: x - ox };
  }
}

export interface DimLine {
  from: Vec3;
  to: Vec3;
  /** Medida en mm que representa la línea. */
  value: Millimeters;
  /** `size` es una medida propia de lo seleccionado; `gap` es una distancia a un borde. */
  kind: "size" | "gap";
}

/** Cotas de lo seleccionado: su tamaño y a qué distancia queda de cada extremo del muro y del piso. */
export function dimensionsFor(world: World, sel: Selection): DimLine[] {
  const out: DimLine[] = [];
  const along = (room: Room, wall: WallSide, u0: number, u1: number, y: number, inset: number, kind: DimLine["kind"]) => {
    if (u1 - u0 >= 1) out.push({ from: wallPoint(room, wall, u0, y, inset), to: wallPoint(room, wall, u1, y, inset), value: Math.round(u1 - u0), kind });
  };
  const up = (room: Room, wall: WallSide, u: number, y0: number, y1: number, inset: number, kind: DimLine["kind"]) => {
    if (y1 - y0 >= 1) out.push({ from: wallPoint(room, wall, u, y0, inset), to: wallPoint(room, wall, u, y1, inset), value: Math.round(y1 - y0), kind });
  };
  if (sel.kind === "item") {
    const item = world.items.find((i) => i.id === sel.itemId);
    if (!item) return out;
    const room = getRoom(world, item.roomId);
    const len = wallLength(room, item.wall);
    const box = itemBox(room, item);
    const front = wallCoordDepth(room, item.wall, box);
    const { width: w, height: h } = item.params;
    const inset = front + 120;
    along(room, item.wall, 0, item.offset, 30, inset, "gap");
    along(room, item.wall, item.offset, item.offset + w, 30, inset, "size");
    along(room, item.wall, item.offset + w, len, 30, inset, "gap");
    const side = len - item.offset - w >= 150 ? item.offset + w + 80 : Math.max(0, item.offset - 80);
    up(room, item.wall, side, 0, item.elevation, front, "gap");
    up(room, item.wall, side, item.elevation, item.elevation + h, front, "size");
    // Mueble suelto: cuánto queda entre su espalda y el muro, y entre su frente y el muro de enfrente.
    if (item.gap) {
      const mid = item.offset + w / 2, across = (u0: number, u1: number) => { if (u1 - u0 >= 1) out.push({ from: wallPoint(room, item.wall, mid, 30, u0), to: wallPoint(room, item.wall, mid, 30, u1), value: Math.round(u1 - u0), kind: "gap" }); };
      across(0, item.gap);
      across(front, roomSpan(room, item.wall));
    }
  } else if (sel.kind === "opening") {
    const room = getRoom(world, sel.roomId);
    const o = room.openings.find((x) => x.id === sel.openingId);
    if (!o) return out;
    const len = wallLength(room, o.wall);
    const y = Math.min(room.height - 40, o.sill + o.height + 120);
    along(room, o.wall, 0, o.offset, y, 40, "gap");
    along(room, o.wall, o.offset, o.offset + o.width, y, 40, "size");
    along(room, o.wall, o.offset + o.width, len, y, 40, "gap");
    const side = len - o.offset - o.width >= 150 ? o.offset + o.width + 80 : Math.max(0, o.offset - 80);
    up(room, o.wall, side, 0, o.sill, 40, "gap");
    up(room, o.wall, side, o.sill, o.sill + o.height, 40, "size");
  } else if (sel.kind === "point") {
    const room = getRoom(world, sel.roomId);
    const p = room.points?.find((x) => x.id === sel.pointId);
    if (!p) return out;
    if (p.wall !== undefined && p.offset !== undefined && p.height !== undefined) {
      along(room, p.wall, 0, p.offset, p.height, 40, "gap");
      along(room, p.wall, p.offset, wallLength(room, p.wall), p.height, 40, "gap");
      up(room, p.wall, p.offset, 0, p.height, 40, "size");
    } else {
      const x = p.x ?? 0, z = p.z ?? 0, y = room.height - 40;
      const line = (u0: number, i0: number, u1: number, i1: number) => out.push({ from: wallPoint(room, "north", u0, y, i0), to: wallPoint(room, "north", u1, y, i1), value: Math.round(Math.abs(u1 - u0) + Math.abs(i1 - i0)), kind: "gap" });
      line(0, z, x, z); line(x, z, room.width, z); line(x, 0, x, z); line(x, z, x, room.depth);
    }
  } else if (sel.kind === "block") {
    const room = getRoom(world, sel.roomId);
    const b = room.blocks?.find((x) => x.id === sel.blockId);
    if (!b) return out;
    // Medido desde el muro norte: a lo largo es de oeste a este, y hacia adentro de norte a sur.
    const across = (u: number, i0: number, i1: number, kind: DimLine["kind"]) => { if (i1 - i0 >= 1) out.push({ from: wallPoint(room, "north", u, 30, i0), to: wallPoint(room, "north", u, 30, i1), value: Math.round(i1 - i0), kind }); };
    const midX = b.x + b.width / 2, midZ = b.z + b.depth / 2;
    along(room, "north", 0, b.x, 30, midZ, "gap");
    along(room, "north", b.x + b.width, room.width, 30, midZ, "gap");
    across(midX, 0, b.z, "gap");
    across(midX, b.z + b.depth, room.depth, "gap");
    along(room, "north", b.x, b.x + b.width, 30, b.z + b.depth + 100, "size");
    across(b.x + b.width + 100, b.z, b.z + b.depth, "size");
  } else if (sel.kind === "wall") {
    const room = getRoom(world, sel.roomId);
    along(room, sel.wall, 0, wallLength(room, sel.wall), room.height + 120, 0, "size");
    up(room, sel.wall, -80, 0, room.height, 0, "size");
  } else if (sel.kind === "room") {
    const room = getRoom(world, sel.roomId);
    along(room, "north", 0, room.width, 30, 250, "size");
    along(room, "west", 0, room.depth, 30, 250, "size");
    up(room, "north", 0, 0, room.height, 60, "size");
  }
  return out;
}

/** Hasta dónde sobresale una caja desde la cara interior de un muro. */
function wallCoordDepth(room: Room, wall: WallSide, box: { min: Vec3; max: Vec3 }): number {
  const a = wallCoord(room, wall, box.min[0], box.min[2]).inset, b = wallCoord(room, wall, box.max[0], box.max[2]).inset;
  return Math.max(a, b);
}

/**
 * Ajusta una posición arrastrada: la redondea a la rejilla, la mantiene dentro del muro y la "imanta"
 * a los extremos del muro y a los bordes de puertas, ventanas y muebles vecinos.
 */
export function snapAlongWall(world: World, roomId: string, wall: WallSide, width: Millimeters, raw: number, exclude: { itemId?: string; openingId?: string } = {}, grid = 10, tolerance = 40): number {
  const room = getRoom(world, roomId);
  const len = wallLength(room, wall);
  const max = Math.max(0, len - width);
  const edges: number[] = [0, len];
  for (const o of room.openings) if (o.wall === wall && o.id !== exclude.openingId) edges.push(o.offset, o.offset + o.width);
  for (const i of world.items) if (i.roomId === room.id && i.wall === wall && i.id !== exclude.itemId) edges.push(i.offset, i.offset + i.params.width);
  // Los bordes de columnas y esquinas cerradas también atraen, estén o no pegadas a este muro.
  for (const blk of room.blocks ?? []) edges.push(...(wall === "north" ? [blk.x, blk.x + blk.width] : wall === "south" ? [room.width - blk.x - blk.width, room.width - blk.x] : wall === "east" ? [blk.z, blk.z + blk.depth] : [room.depth - blk.z - blk.depth, room.depth - blk.z]));
  // Un borde vecino atrae tanto al lado izquierdo como al derecho de lo que se mueve.
  const candidates = edges.flatMap((e) => [e, e - width]).filter((c) => c >= 0 && c <= max);
  const near = candidates.map((c) => ({ c, d: Math.abs(c - raw) })).filter((x) => x.d <= tolerance).sort((a, b) => a.d - b.d)[0];
  const value = near ? near.c : Math.round(raw / grid) * grid;
  return Math.min(max, Math.max(0, value));
}

/**
 * Ajusta la separación del muro de un mueble que se arrastra hacia adentro del cuarto: la mantiene dentro,
 * la redondea a la rejilla y la "imanta" al muro, al centro del cuarto y al muro de enfrente.
 */
export function snapGap(world: World, itemId: string, raw: number, grid = 10, tolerance = 60): number {
  const item = world.items.find((i) => i.id === itemId);
  if (!item) return 0;
  const room = getRoom(world, item.roomId);
  const max = Math.max(0, roomSpan(room, item.wall) - frontDepth(item.params));
  const near = [0, Math.round(max / 2), max].map((c) => ({ c, d: Math.abs(c - raw) })).filter((x) => x.d <= tolerance).sort((a, b) => a.d - b.d)[0];
  return Math.min(max, Math.max(0, near ? near.c : Math.round(raw / grid) * grid));
}
