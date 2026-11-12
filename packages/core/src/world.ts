import type { FurnitureModel, HardwareItem, Millimeters } from "./model/index.js";
import { generateCabinet, type CabinetParams } from "./generators/cabinet.js";
import { checkMotionCollisions, overlaps, type AABB, type Collision, type Obstacle } from "./collision.js";
import { validateFurniture, type Issue } from "./validate.js";
import { planFloor, type FloorSpec } from "./flooring.js";

/**
 * El "mundo" de Handy: el duplicado virtual de los espacios del usuario (su casa, su taller)
 * con los muebles colocados dentro. Es el contexto compartido sobre el que razonan la persona y la IA.
 *
 * Ejes del mundo (los mismos de glTF y three.js): X a la derecha, Y arriba, Z hacia el observador.
 * En planta se usa X y Z. Todo en milímetros enteros.
 */
export type WallSide = "north" | "east" | "south" | "west";

export const WALL_NAMES: Record<WallSide, string> = { north: "muro norte", east: "muro este", south: "muro sur", west: "muro oeste" };

export interface Opening {
  id: string;
  wall: WallSide;
  type: "door" | "window" | "pass";
  /** Distancia desde el extremo izquierdo del muro, mirándolo desde dentro de la habitación. */
  offset: Millimeters;
  width: Millimeters;
  height: Millimeters;
  /** Altura del antepecho (ventanas). 0 para puertas. */
  sill: Millimeters;
}

/** Habitación rectangular. `origin` es la esquina interior noroeste (x mínimo, z mínimo). */
export interface Room {
  id: string;
  name: string;
  origin: [Millimeters, Millimeters];
  width: Millimeters; // a lo largo de X (muros norte y sur)
  depth: Millimeters; // a lo largo de Z (muros este y oeste)
  height: Millimeters;
  wallThickness: Record<WallSide, Millimeters>;
  openings: Opening[];
  /** Piso instalado o planeado en la habitación. */
  floor?: FloorSpec;
}

export interface PlacedItem {
  id: string;
  name: string;
  roomId: string;
  kind: "cabinet";
  params: CabinetParams;
  /** Muro contra el que apoya la espalda del mueble. */
  wall: WallSide;
  /** Distancia desde el extremo izquierdo del muro, mirándolo desde dentro. */
  offset: Millimeters;
  /** Altura sobre el piso (0 = apoyado; >0 = mueble colgado). */
  elevation: Millimeters;
}

export interface World {
  version: 1;
  name: string;
  rooms: Room[];
  items: PlacedItem[];
  updatedAt?: string;
}

export function createWorld(name: string): World {
  return { version: 1, name, rooms: [], items: [] };
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

function uniqueId(base: string, taken: string[]): string {
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

export interface RoomInput {
  name: string;
  width: Millimeters;
  depth: Millimeters;
  height?: Millimeters;
  wallThickness?: Millimeters | Partial<Record<WallSide, Millimeters>>;
  origin?: [Millimeters, Millimeters];
}

export function addRoom(world: World, input: RoomInput): Room {
  if (input.width < 500 || input.depth < 500) throw new Error("La habitación debe medir al menos 500 x 500 mm.");
  const t = input.wallThickness;
  const thick = (side: WallSide) => (typeof t === "number" ? t : t?.[side] ?? 150);
  const room: Room = {
    id: uniqueId(slug(input.name), world.rooms.map((r) => r.id)),
    name: input.name,
    origin: input.origin ?? [0, 0],
    width: input.width,
    depth: input.depth,
    height: input.height ?? 2400,
    wallThickness: { north: thick("north"), east: thick("east"), south: thick("south"), west: thick("west") },
    openings: [],
  };
  world.rooms.push(room);
  return room;
}

export const wallLength = (room: Room, wall: WallSide): Millimeters => (wall === "north" || wall === "south" ? room.width : room.depth);

export function getRoom(world: World, roomId: string): Room {
  const room = world.rooms.find((r) => r.id === roomId);
  if (!room) throw new Error(`No existe la habitación "${roomId}". Disponibles: ${world.rooms.map((r) => r.id).join(", ") || "ninguna"}.`);
  return room;
}

export function addOpening(world: World, roomId: string, input: Omit<Opening, "id" | "sill"> & { sill?: Millimeters }): Opening {
  const room = getRoom(world, roomId);
  const len = wallLength(room, input.wall);
  if (input.offset < 0 || input.offset + input.width > len) throw new Error(`La abertura no cabe en el ${WALL_NAMES[input.wall]} (largo ${len} mm).`);
  const sill = input.sill ?? (input.type === "window" ? 1000 : 0);
  if (sill + input.height > room.height) throw new Error("La abertura supera la altura de la habitación.");
  const opening: Opening = { ...input, sill, id: uniqueId(`${input.type}-${input.wall}`, room.openings.map((o) => o.id)) };
  room.openings.push(opening);
  return opening;
}

// ---------- Geometría ----------

/** Giro alrededor de Y que lleva el frente del mueble hacia el interior de la habitación. */
export const WALL_ROTATION: Record<WallSide, 0 | 90 | 180 | 270> = { north: 0, west: 90, south: 180, east: 270 };

const rot = (deg: number, x: number, z: number): [number, number] => {
  const r = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r));
  return [x * c + z * s, -x * s + z * c];
};

/** Posición en el mundo del origen local del mueble (esquina inferior izquierda trasera) y su giro. */
export function itemTransform(room: Room, item: Pick<PlacedItem, "wall" | "offset" | "elevation">): { position: [number, number, number]; rotationY: 0 | 90 | 180 | 270 } {
  const [ox, oz] = room.origin;
  const { wall, offset, elevation } = item;
  const position: [number, number, number] =
    wall === "north" ? [ox + offset, elevation, oz] :
    wall === "south" ? [ox + room.width - offset, elevation, oz + room.depth] :
    wall === "east" ? [ox + room.width, elevation, oz + offset] :
    [ox, elevation, oz + room.depth - offset];
  return { position, rotationY: WALL_ROTATION[wall] };
}

function boxFromPoints(pts: [number, number, number][]): AABB {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
  return { min, max };
}

function boxCorners(b: AABB): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}

/** Lleva una caja del sistema del mueble al del mundo. */
export function localToWorld(box: AABB, t: { position: [number, number, number]; rotationY: number }): AABB {
  return boxFromPoints(boxCorners(box).map(([x, y, z]) => { const [rx, rz] = rot(t.rotationY, x, z); return [t.position[0] + rx, t.position[1] + y, t.position[2] + rz]; }));
}

/** Lleva una caja del mundo al sistema del mueble. */
export function worldToLocal(box: AABB, t: { position: [number, number, number]; rotationY: number }): AABB {
  return boxFromPoints(boxCorners(box).map(([x, y, z]) => { const [rx, rz] = rot(-t.rotationY, x - t.position[0], z - t.position[2]); return [rx, y - t.position[1], rz]; }));
}

/** Caja de cada muro en el mundo (maciza, sin descontar aberturas). */
export function wallBoxes(room: Room): Record<WallSide, AABB> {
  const [ox, oz] = room.origin;
  const { width: W, depth: D, height: H, wallThickness: t } = room;
  return {
    north: { min: [ox - t.west, 0, oz - t.north], max: [ox + W + t.east, H, oz] },
    south: { min: [ox - t.west, 0, oz + D], max: [ox + W + t.east, H, oz + D + t.south] },
    west: { min: [ox - t.west, 0, oz], max: [ox, H, oz + D] },
    east: { min: [ox + W, 0, oz], max: [ox + W + t.east, H, oz + D] },
  };
}

export function itemModel(item: PlacedItem): FurnitureModel {
  return generateCabinet({ ...item.params, name: item.name });
}

/** Volumen cerrado del mueble (incluye el espesor de las puertas) en el mundo. */
export function itemBox(room: Room, item: PlacedItem): AABB {
  const p = item.params;
  // Puertas y frentes de cajón van por fuera de la caja.
  const front = p.depth + ((p.doors ?? 0) > 0 || (p.drawers ?? 0) > 0 ? (p.boardThickness ?? 18) : 0);
  return localToWorld({ min: [0, 0, 0], max: [p.width, p.height, front] }, itemTransform(room, item));
}

// ---------- Colocar y consultar ----------

export interface PlaceInput {
  roomId: string;
  wall: WallSide;
  offset: Millimeters;
  elevation?: Millimeters;
  name?: string;
  params: CabinetParams;
}

export function placeCabinet(world: World, input: PlaceInput): PlacedItem {
  const room = getRoom(world, input.roomId);
  const len = wallLength(room, input.wall);
  const elevation = input.elevation ?? 0;
  if (input.offset < 0 || input.offset + input.params.width > len) {
    throw new Error(`No cabe: el mueble ocupa de ${input.offset} a ${input.offset + input.params.width} mm y el ${WALL_NAMES[input.wall]} mide ${len} mm.`);
  }
  if (elevation + input.params.height > room.height) throw new Error(`No cabe en altura: ${elevation + input.params.height} mm contra ${room.height} mm de la habitación.`);
  generateCabinet(input.params); // valida medidas
  const name = input.name ?? `Gabinete ${input.params.width}`;
  const item: PlacedItem = { id: uniqueId(slug(name), world.items.map((i) => i.id)), name, roomId: room.id, kind: "cabinet", params: input.params, wall: input.wall, offset: input.offset, elevation };
  world.items.push(item);
  return item;
}

export interface ItemPatch {
  name?: string;
  wall?: WallSide;
  offset?: Millimeters;
  elevation?: Millimeters;
  params?: Partial<CabinetParams>;
}

/** Modifica un mueble ya colocado. Valida que siga cabiendo; si no, lanza un error y no cambia nada. */
export function updateItem(world: World, itemId: string, patch: ItemPatch): PlacedItem {
  const item = world.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No existe el mueble "${itemId}".`);
  const room = getRoom(world, item.roomId);
  const next: PlacedItem = { ...item, ...patch, params: { ...item.params, ...patch.params } };
  const len = wallLength(room, next.wall);
  if (next.offset < 0 || next.offset + next.params.width > len) {
    throw new Error(`No cabe: ocuparía de ${next.offset} a ${next.offset + next.params.width} mm y el ${WALL_NAMES[next.wall]} mide ${len} mm.`);
  }
  if (next.elevation < 0 || next.elevation + next.params.height > room.height) throw new Error(`No cabe en altura: llegaría a ${next.elevation + next.params.height} mm y la habitación mide ${room.height} mm.`);
  generateCabinet(next.params);
  Object.assign(item, next);
  return item;
}

export function updateOpening(world: World, roomId: string, openingId: string, patch: Partial<Omit<Opening, "id" | "wall">>): Opening {
  const room = getRoom(world, roomId);
  const opening = room.openings.find((o) => o.id === openingId);
  if (!opening) throw new Error(`No existe la abertura "${openingId}" en ${room.name}.`);
  const next = { ...opening, ...patch };
  const len = wallLength(room, next.wall);
  if (next.offset < 0 || next.offset + next.width > len) throw new Error(`No cabe: ocuparía de ${next.offset} a ${next.offset + next.width} mm y el ${WALL_NAMES[next.wall]} mide ${len} mm.`);
  if (next.sill < 0 || next.sill + next.height > room.height) throw new Error("La abertura supera la altura de la habitación.");
  Object.assign(opening, next);
  return opening;
}

export function removeOpening(world: World, roomId: string, openingId: string): boolean {
  const room = getRoom(world, roomId);
  const n = room.openings.length;
  room.openings = room.openings.filter((o) => o.id !== openingId);
  return room.openings.length < n;
}

export interface RoomPatch {
  name?: string;
  width?: Millimeters;
  depth?: Millimeters;
  height?: Millimeters;
  wallThickness?: Partial<Record<WallSide, Millimeters>>;
}

/** Cambia medidas de una habitación. Rechaza el cambio si una abertura o un mueble dejaría de caber. */
export function updateRoom(world: World, roomId: string, patch: RoomPatch): Room {
  const room = getRoom(world, roomId);
  const next: Room = { ...room, ...patch, wallThickness: { ...room.wallThickness, ...patch.wallThickness } };
  if (next.width < 500 || next.depth < 500 || next.height < 1800) throw new Error("Medidas demasiado pequeñas para una habitación.");
  for (const o of next.openings) {
    if (o.offset + o.width > wallLength(next, o.wall) || o.sill + o.height > next.height) throw new Error(`Con esas medidas ya no cabe la abertura ${o.id} del ${WALL_NAMES[o.wall]}. Muévela o quítala primero.`);
  }
  for (const i of world.items.filter((x) => x.roomId === room.id)) {
    if (i.offset + i.params.width > wallLength(next, i.wall) || i.elevation + i.params.height > next.height) throw new Error(`Con esas medidas ya no cabe ${i.name}. Muévelo o cámbialo primero.`);
  }
  Object.assign(room, next);
  return room;
}

export function removeItem(world: World, itemId: string): boolean {
  const n = world.items.length;
  world.items = world.items.filter((i) => i.id !== itemId);
  return world.items.length < n;
}

export interface WallRun {
  wall: WallSide;
  from: Millimeters;
  to: Millimeters;
  length: Millimeters;
}

/** Proyección de una caja del mundo sobre un muro, en la coordenada "offset" de ese muro. */
function spanOnWall(room: Room, wall: WallSide, box: AABB): [number, number] {
  const [ox, oz] = room.origin;
  switch (wall) {
    case "north": return [box.min[0] - ox, box.max[0] - ox];
    case "south": return [ox + room.width - box.max[0], ox + room.width - box.min[0]];
    case "east": return [box.min[2] - oz, box.max[2] - oz];
    case "west": return [oz + room.depth - box.max[2], oz + room.depth - box.min[2]];
  }
}

/** Distancia de una caja a la cara interior del muro. */
function distanceToWall(room: Room, wall: WallSide, box: AABB): number {
  const [ox, oz] = room.origin;
  switch (wall) {
    case "north": return box.min[2] - oz;
    case "south": return oz + room.depth - box.max[2];
    case "east": return ox + room.width - box.max[0];
    case "west": return box.min[0] - ox;
  }
}

/**
 * Tramos libres de cada muro para un mueble que ocupa desde `elevation` hasta `elevation + height`:
 * descuenta puertas y pasos, ventanas que el mueble taparía, y muebles ya colocados junto a ese muro.
 */
export function freeWallRuns(world: World, roomId: string, opts: { height?: Millimeters; elevation?: Millimeters; minLength?: Millimeters } = {}): WallRun[] {
  const room = getRoom(world, roomId);
  const elevation = opts.elevation ?? 0;
  const top = elevation + (opts.height ?? 900);
  const runs: WallRun[] = [];
  for (const wall of ["north", "east", "south", "west"] as WallSide[]) {
    const len = wallLength(room, wall);
    const blocked: [number, number][] = [];
    for (const o of room.openings) {
      if (o.wall !== wall) continue;
      const blocks = o.type !== "window" ? elevation < o.sill + o.height : top > o.sill && elevation < o.sill + o.height;
      if (blocks) blocked.push([o.offset, o.offset + o.width]);
    }
    for (const item of world.items) {
      if (item.roomId !== room.id) continue;
      const box = itemBox(room, item);
      if (distanceToWall(room, wall, box) > 50) continue;
      if (box.max[1] <= elevation || box.min[1] >= top) continue;
      blocked.push(spanOnWall(room, wall, box));
    }
    blocked.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [a, b] of blocked) {
      if (a > cursor) runs.push({ wall, from: cursor, to: Math.min(a, len), length: Math.min(a, len) - cursor });
      cursor = Math.max(cursor, b);
    }
    if (cursor < len) runs.push({ wall, from: cursor, to: len, length: len - cursor });
  }
  return runs.filter((r) => r.length >= (opts.minLength ?? 1));
}

// ---------- Revisión del mundo ----------

export interface WorldIssue {
  level: "error" | "warning" | "tip";
  code: string;
  itemId?: string;
  roomId?: string;
  message: string;
}

/** Revisa todo el mundo: solapes entre muebles, aberturas tapadas, colisiones al abrir y reglas de cada mueble. */
export function checkWorld(world: World): WorldIssue[] {
  const issues: WorldIssue[] = [];
  for (const room of world.rooms) {
    const items = world.items.filter((i) => i.roomId === room.id);
    const walls = wallBoxes(room);
    const boxes = new Map(items.map((i) => [i.id, itemBox(room, i)]));

    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
      if (overlaps(boxes.get(items[a].id)!, boxes.get(items[b].id)!, 1)) {
        issues.push({ level: "error", code: "items-overlap", itemId: items[a].id, roomId: room.id, message: `${items[a].name} y ${items[b].name} se solapan en ${room.name}.` });
      }
    }

    for (const item of items) {
      const box = boxes.get(item.id)!;
      const [s0, s1] = spanOnWall(room, item.wall, box);
      for (const o of room.openings) {
        if (o.wall !== item.wall || s1 <= o.offset || s0 >= o.offset + o.width) continue;
        const vertical = box.max[1] > o.sill && box.min[1] < o.sill + o.height;
        if (!vertical) continue;
        issues.push({
          level: o.type === "window" ? "warning" : "error",
          code: o.type === "window" ? "blocks-window" : "blocks-door",
          itemId: item.id, roomId: room.id,
          message: `${item.name} tapa ${o.type === "window" ? "la ventana" : o.type === "door" ? "la puerta" : "el paso"} del ${WALL_NAMES[o.wall]} en ${room.name}.`,
        });
      }

      const t = itemTransform(room, item);
      const obstacles: Obstacle[] = [
        ...(Object.keys(walls) as WallSide[]).map((w) => ({ id: `wall-${w}`, name: WALL_NAMES[w], box: worldToLocal(walls[w], t) })),
        ...items.filter((o) => o.id !== item.id).map((o) => ({ id: o.id, name: o.name, box: worldToLocal(boxes.get(o.id)!, t) })),
      ];
      const model = itemModel(item);
      for (const c of checkMotionCollisions(model, obstacles) as Collision[]) {
        issues.push({ level: "warning", code: "motion-collision", itemId: item.id, roomId: room.id, message: `${item.name}: ${c.message}` });
      }
      for (const i of validateFurniture(model) as Issue[]) {
        if (i.level === "tip") continue;
        issues.push({ level: i.level, code: i.code, itemId: item.id, roomId: room.id, message: `${item.name}: ${i.message}` });
      }
    }
  }
  return issues;
}

// ---------- Para cotizar y para la IA ----------

/** Une todos los muebles en un solo modelo para cotizar tableros y herrajes de forma consolidada. */
export function mergedModel(world: World, itemIds?: string[]): FurnitureModel {
  const items = world.items.filter((i) => !itemIds || itemIds.includes(i.id));
  const hardware = new Map<string, HardwareItem>();
  const merged: FurnitureModel = { id: slug(world.name), name: world.name, dims: { width: 0, height: 0, depth: 0 }, joinery: "minifix", panels: [], hardware: [], materials: [] };
  for (const item of items) {
    const m = itemModel(item);
    for (const p of m.panels) merged.panels.push({ ...p, id: `${item.id}/${p.id}`, name: `${item.name} · ${p.name}`, placement: undefined, instances: undefined, motion: undefined });
    for (const h of m.hardware) {
      const cur = hardware.get(h.id);
      if (cur) cur.qty += h.qty; else hardware.set(h.id, { ...h });
    }
    for (const mat of m.materials) if (!merged.materials.some((x) => x.id === mat.id)) merged.materials.push(mat);
  }
  merged.hardware = [...hardware.values()];
  return merged;
}

const m2 = (a: number, b: number) => ((a * b) / 1e6).toFixed(1).replace(".", ",");

/** Resumen en texto del mundo, pensado para que una IA razone sobre el espacio sin ver la geometría. */
export function describeWorld(world: World): string {
  const lines: string[] = [`Mundo "${world.name}": ${world.rooms.length} habitación(es), ${world.items.length} mueble(s). Medidas en mm. Los offsets se miden desde el extremo izquierdo de cada muro mirándolo desde dentro.`];
  for (const room of world.rooms) {
    lines.push(`\n## ${room.name} (id: ${room.id}) · ${room.width} x ${room.depth} x ${room.height} alto · ${m2(room.width, room.depth)} m²`);
    for (const wall of ["north", "east", "south", "west"] as WallSide[]) {
      const ops = room.openings.filter((o) => o.wall === wall).map((o) => `${o.type === "door" ? "puerta" : o.type === "window" ? "ventana" : "paso"} ${o.width}x${o.height} en ${o.offset}–${o.offset + o.width}${o.sill ? `, antepecho ${o.sill}` : ""}`);
      lines.push(`- ${WALL_NAMES[wall]} (${wall}): largo ${wallLength(room, wall)}, grosor ${room.wallThickness[wall]}${ops.length ? `; ${ops.join("; ")}` : ""}`);
    }
    const items = world.items.filter((i) => i.roomId === room.id);
    if (items.length) lines.push("Muebles:");
    for (const i of items) {
      const p = i.params;
      lines.push(`- ${i.name} (id: ${i.id}): ${p.width} x ${p.height} x ${p.depth}, en ${WALL_NAMES[i.wall]} de ${i.offset} a ${i.offset + p.width}${i.elevation ? `, colgado a ${i.elevation}` : ""}; ${p.doors ?? 0} puerta(s), ${p.shelves ?? 0} repisa(s)${p.dividers ? `, ${p.dividers} división(es)` : ""}${p.drawers ? `, ${p.drawers} cajón(es)` : ""}${p.hangingBar ? ", barra de colgar" : ""}, unión ${p.joinery ?? "confirmat"}`);
    }
    if (room.floor) {
      const f = room.floor, plan = planFloor(room, f);
      lines.push(`Piso: ${f.material === "porcelain" ? "porcelanato" : "cerámica"} ${f.tileWidth} x ${f.tileLength}, junta ${f.joint}, ${f.pattern === "brick" ? "trabado" : "recto"}, arranque ${f.start === "center" ? "centrado" : "desde la esquina"}; ${plan.tilesToBuy} piezas en ${plan.boxes} caja(s), pega ${plan.adhesive.type} ${plan.adhesive.kg} kg, boquilla ${plan.grout.kg} kg`);
    }
    const runs = freeWallRuns(world, room.id, { height: 900, minLength: 300 });
    lines.push(`Tramos libres a nivel de piso (≥ 300): ${runs.map((r) => `${WALL_NAMES[r.wall]} ${r.from}–${r.to} (${r.length})`).join("; ") || "ninguno"}`);
  }
  return lines.join("\n");
}
