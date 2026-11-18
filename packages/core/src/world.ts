import type { FurnitureModel, HardwareItem, Millimeters } from "./model/index.js";
import { generateCabinet, type CabinetParams } from "./generators/cabinet.js";
import { generateFrame, type FrameOptions } from "./generators/frame.js";
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
import { describeElectrical, electricalIssues } from "./electrical.js";

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

/**
 * Macizo dentro de la habitación: una columna, un buitrón, una chimenea, un muro bajo, o una esquina
 * cerrada que convierte el rectángulo en una L. Ocupa piso, estorba a los muebles y se ve como muro.
 */
export interface Block {
  id: string;
  name: string;
  /** Esquina noroeste del macizo, medida desde la esquina interior noroeste de la habitación. */
  x: Millimeters;
  z: Millimeters;
  /** De oeste a este. */
  width: Millimeters;
  /** De norte a sur. */
  depth: Millimeters;
  /** Alto. Si falta, llega hasta el techo. */
  height?: Millimeters;
}

export type PointKind = "outlet" | "switch" | "data" | "light" | "water" | "drain" | "gas";

/**
 * Punto de instalación: eléctrico (toma, interruptor, datos, luz) o de servicio (agua, desagüe, gas).
 * Tomas, interruptores, datos y servicios van en un muro (`wall`, `offset`, `height`);
 * las luces van en el techo (`x` desde el muro oeste, `z` desde el muro norte).
 */
export interface ElectricPoint {
  id: string;
  name: string;
  kind: PointKind;
  wall?: WallSide;
  /** Distancia desde el extremo izquierdo del muro, mirándolo desde dentro. */
  offset?: Millimeters;
  /** Altura del centro de la caja sobre el piso terminado. */
  height?: Millimeters;
  x?: Millimeters;
  z?: Millimeters;
  /** Toma con protección de falla a tierra, para zonas húmedas. */
  gfci?: boolean;
}

/** Habitación rectangular, con macizos opcionales que la recortan. `origin` es la esquina interior noroeste (x mínimo, z mínimo). */
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
  /** Columnas, buitrones y esquinas cerradas. */
  blocks?: Block[];
  /** Tomas, interruptores, puntos de datos y luces. */
  points?: ElectricPoint[];
}

export interface PlacedItem {
  id: string;
  name: string;
  roomId: string;
  /** Mueble de tablero, o estructura de tubo (entonces `params` solo aporta ancho, alto y fondo, y `frame` el resto). */
  kind: "cabinet" | "frame";
  params: CabinetParams;
  frame?: FrameOptions;
  /** Muro contra el que apoya la espalda del mueble. */
  wall: WallSide;
  /** Distancia desde el extremo izquierdo del muro, mirándolo desde dentro. */
  offset: Millimeters;
  /** Altura sobre el piso (0 = apoyado; >0 = mueble colgado). */
  elevation: Millimeters;
  /**
   * Separación entre la espalda del mueble y su muro. Sin ella, el mueble va pegado al muro.
   * Con ella queda suelto en el cuarto (una mesa, una isla), mirando hacia donde mira ese muro.
   */
  gap?: Millimeters;
}

export interface World {
  version: 1;
  name: string;
  rooms: Room[];
  items: PlacedItem[];
  /** Dónde está la casa y hacia dónde mira, para el estudio de sol. */
  site?: Site;
  updatedAt?: string;
}

export interface Site {
  /** Nombre del lugar, si se dio una ciudad. */
  place?: string;
  /** Grados; norte positivo. */
  latitude: number;
  /** Grados; este positivo (América es negativo). */
  longitude: number;
  /** Horas respecto a UTC de la hora local (Colombia: -5). */
  utcOffset: number;
  /** Hacia dónde mira de verdad el "muro norte" del modelo, en grados desde el norte y en sentido horario. 0 = norte, 90 = este. */
  north: number;
}

export function createWorld(name: string): World {
  return { version: 1, name, rooms: [], items: [] };
}

export const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

export function uniqueId(base: string, taken: string[]): string {
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

export const OPPOSITE: Record<WallSide, WallSide> = { north: "south", south: "north", east: "west", west: "east" };

/** Coordenada de la cara interior de un muro sobre su eje perpendicular, y su tramo a lo largo del otro eje. */
function wallFace(room: Room, wall: WallSide): { at: number; from: number; to: number } {
  const [ox, oz] = room.origin;
  switch (wall) {
    case "north": return { at: oz, from: ox, to: ox + room.width };
    case "south": return { at: oz + room.depth, from: ox, to: ox + room.width };
    case "west": return { at: ox, from: oz, to: oz + room.depth };
    case "east": return { at: ox + room.width, from: oz, to: oz + room.depth };
  }
}

/**
 * La habitación vecina con la que un muro se comparte, si la hay: sus caras interiores quedan separadas
 * exactamente por el grosor del muro (uno de los dos lados puede tener grosor 0 porque el muro es del otro).
 */
export function adjacentWall(world: World, room: Room, wall: WallSide): { room: Room; wall: WallSide } | null {
  const mine = wallFace(room, wall);
  const outward = wall === "north" || wall === "west" ? -1 : 1;
  for (const other of world.rooms) {
    if (other.id === room.id) continue;
    const theirs = wallFace(other, OPPOSITE[wall]);
    const gap = (theirs.at - mine.at) * outward;
    const thickness = room.wallThickness[wall] + other.wallThickness[OPPOSITE[wall]];
    if (thickness <= 0 || Math.abs(gap - thickness) > 5) continue;
    if (Math.min(mine.to, theirs.to) - Math.max(mine.from, theirs.from) < 100) continue;
    return { room: other, wall: OPPOSITE[wall] };
  }
  return null;
}

export type EffectiveOpening = Opening & { ownerRoomId: string };

/**
 * Aberturas que atraviesan un muro: las propias y las que la habitación vecina tiene en la cara opuesta
 * del mismo muro, llevadas a las distancias de este lado. Una puerta entre dos cuartos se guarda una sola vez.
 */
export function effectiveOpenings(world: World, room: Room, wall: WallSide): EffectiveOpening[] {
  const out: EffectiveOpening[] = room.openings.filter((o) => o.wall === wall).map((o) => ({ ...o, ownerRoomId: room.id }));
  const adj = adjacentWall(world, room, wall);
  if (!adj) return out;
  const len = wallLength(room, wall);
  const mineStart = wallFace(room, wall).from, theirStart = wallFace(adj.room, adj.wall).from;
  for (const o of adj.room.openings) {
    if (o.wall !== adj.wall) continue;
    // Posición absoluta de la abertura a lo largo del eje del muro, vista desde la vecina.
    const reversedThere = adj.wall === "south" || adj.wall === "west";
    const absFrom = reversedThere ? theirStart + wallLength(adj.room, adj.wall) - o.offset - o.width : theirStart + o.offset;
    const reversedHere = wall === "south" || wall === "west";
    const here = reversedHere ? mineStart + len - (absFrom + o.width) : absFrom - mineStart;
    const from = Math.max(0, here), to = Math.min(len, here + o.width);
    if (to - from < 100) continue;
    out.push({ ...o, wall, offset: Math.round(from), width: Math.round(to - from), ownerRoomId: adj.room.id });
  }
  return out;
}

export interface AttachInput extends Omit<RoomInput, "origin"> {
  /** Habitación existente a la que se pega la nueva. */
  to: string;
  /** Lado de la habitación existente donde queda la nueva. */
  side: WallSide;
  /** Desplazamiento a lo largo del muro compartido, desde su inicio (oeste o norte). */
  shift?: Millimeters;
}

/** Agrega una habitación pegada a otra: comparten el muro, que sigue siendo de la habitación existente. */
export function attachRoom(world: World, input: AttachInput): Room {
  const base = getRoom(world, input.to);
  const { to: _to, side, shift = 0, ...rest } = input;
  const t = base.wallThickness[side];
  if (t <= 0) throw new Error(`El ${WALL_NAMES[side]} de ${base.name} ya es compartido con otra habitación.`);
  const [bx, bz] = base.origin;
  const origin: [number, number] =
    side === "east" ? [bx + base.width + t, bz + shift] :
    side === "west" ? [bx - t - input.width, bz + shift] :
    side === "south" ? [bx + shift, bz + base.depth + t] :
    [bx + shift, bz - t - input.depth];
  const requested = rest.wallThickness;
  const thick = (w: WallSide) => (typeof requested === "number" ? requested : requested?.[w] ?? 150);
  return addRoom(world, { ...rest, origin, wallThickness: { north: thick("north"), east: thick("east"), south: thick("south"), west: thick("west"), [OPPOSITE[side]]: 0 } });
}

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

// ---------- Macizos: columnas, buitrones y esquinas cerradas ----------

/** Caja del macizo en el mundo. */
export function blockBox(room: Room, b: Block): AABB {
  const [ox, oz] = room.origin;
  return { min: [ox + b.x, 0, oz + b.z], max: [ox + b.x + b.width, Math.min(b.height ?? room.height, room.height), oz + b.z + b.depth] };
}

/** Tramo de un muro que un macizo tapa por estar pegado a él, o `null` si no lo toca. */
export function blockOnWall(room: Room, b: Block, wall: WallSide): [number, number] | null {
  const touching = wall === "north" ? b.z <= 0 : wall === "south" ? b.z + b.depth >= room.depth : wall === "west" ? b.x <= 0 : b.x + b.width >= room.width;
  if (!touching) return null;
  return wall === "north" ? [b.x, b.x + b.width] : wall === "south" ? [room.width - b.x - b.width, room.width - b.x] : wall === "east" ? [b.z, b.z + b.depth] : [room.depth - b.z - b.depth, room.depth - b.z];
}

function assertBlock(room: Room, b: Block, others: Block[]): void {
  if (b.width < 50 || b.depth < 50) throw new Error("Un macizo debe medir al menos 50 mm por lado.");
  if (b.height !== undefined && (b.height < 50 || b.height > room.height)) throw new Error(`El alto debe estar entre 50 y ${room.height} mm, el alto de la habitación.`);
  if (b.x < 0 || b.z < 0 || b.x + b.width > room.width || b.z + b.depth > room.depth) throw new Error(`No cabe: ${b.name} iría de ${b.x} a ${b.x + b.width} mm de oeste a este y de ${b.z} a ${b.z + b.depth} mm de norte a sur, y ${room.name} mide ${room.width} x ${room.depth} mm.`);
  if (b.width * b.depth > room.width * room.depth * 0.6) throw new Error(`${b.name} ocuparía más de la mitad de ${room.name}. Si la habitación es más pequeña, cambia sus medidas.`);
  for (const o of others) {
    if (b.x < o.x + o.width && o.x < b.x + b.width && b.z < o.z + o.depth && o.z < b.z + b.depth) throw new Error(`${b.name} se cruza con ${o.name}.`);
  }
  const top = b.height ?? room.height;
  for (const wall of ["north", "east", "south", "west"] as WallSide[]) {
    const span = blockOnWall(room, b, wall);
    if (!span) continue;
    for (const o of room.openings) {
      if (o.wall === wall && span[0] < o.offset + o.width && o.offset < span[1] && top > o.sill) throw new Error(`${b.name} taparía ${o.type === "window" ? "la ventana" : o.type === "door" ? "la puerta" : "el paso"} del ${WALL_NAMES[wall]}. Muévela o quítala primero.`);
    }
  }
}

export interface BlockInput { name?: string; x: Millimeters; z: Millimeters; width: Millimeters; depth: Millimeters; height?: Millimeters }

/** Agrega una columna, un buitrón o una esquina cerrada a una habitación. */
export function addBlock(world: World, roomId: string, input: BlockInput): Block {
  const room = getRoom(world, roomId);
  const name = input.name ?? "Columna";
  const blocks = room.blocks ?? [];
  const block: Block = { id: uniqueId(slug(name), blocks.map((b) => b.id)), name, x: Math.round(input.x), z: Math.round(input.z), width: Math.round(input.width), depth: Math.round(input.depth), ...(input.height && input.height < room.height ? { height: Math.round(input.height) } : {}) };
  assertBlock(room, block, blocks);
  room.blocks = [...blocks, block];
  return block;
}

/** Mueve o cambia un macizo. Si el resultado no cabe o tapa una abertura, lanza un error y no cambia nada. */
export function updateBlock(world: World, roomId: string, blockId: string, patch: Omit<Partial<BlockInput>, "height"> & { height?: Millimeters | null }): Block {
  const room = getRoom(world, roomId);
  const block = room.blocks?.find((b) => b.id === blockId);
  if (!block) throw new Error(`No existe "${blockId}" en ${room.name}.`);
  const { height, ...rest } = patch;
  const next: Block = { ...block, ...rest };
  if (height === null || (height !== undefined && height >= room.height)) delete next.height;
  else if (height !== undefined) next.height = Math.round(height);
  assertBlock(room, next, room.blocks!.filter((b) => b.id !== blockId));
  Object.assign(block, next);
  if (next.height === undefined) delete block.height;
  return block;
}

export function removeBlock(world: World, roomId: string, blockId: string): boolean {
  const room = getRoom(world, roomId);
  const before = room.blocks?.length ?? 0;
  room.blocks = (room.blocks ?? []).filter((b) => b.id !== blockId);
  if (!room.blocks.length) delete room.blocks;
  return before > (room.blocks?.length ?? 0);
}

/** Área de piso libre: el rectángulo menos lo que ocupan los macizos. */
export const roomArea = (room: Pick<Room, "width" | "depth" | "blocks">): number => room.width * room.depth - (room.blocks ?? []).reduce((a, b) => a + b.width * b.depth, 0);

/** Giro alrededor de Y que lleva el frente del mueble hacia el interior de la habitación. */
export const WALL_ROTATION: Record<WallSide, 0 | 90 | 180 | 270> = { north: 0, west: 90, south: 180, east: 270 };

const rot = (deg: number, x: number, z: number): [number, number] => {
  const r = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r));
  return [x * c + z * s, -x * s + z * c];
};

/** Posición en el mundo del origen local del mueble (esquina inferior izquierda trasera) y su giro. */
export function itemTransform(room: Room, item: Pick<PlacedItem, "wall" | "offset" | "elevation" | "gap">): { position: [number, number, number]; rotationY: 0 | 90 | 180 | 270 } {
  const [ox, oz] = room.origin;
  const { wall, offset, elevation } = item;
  const gap = item.gap ?? 0;
  const position: [number, number, number] =
    wall === "north" ? [ox + offset, elevation, oz + gap] :
    wall === "south" ? [ox + room.width - offset, elevation, oz + room.depth - gap] :
    wall === "east" ? [ox + room.width - gap, elevation, oz + offset] :
    [ox + gap, elevation, oz + room.depth - offset];
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

export function itemModel(item: Pick<PlacedItem, "kind" | "params" | "frame" | "name">): FurnitureModel {
  if (item.kind === "frame") {
    const { width, height, depth } = item.params;
    return generateFrame({ width, height, depth, type: "table", ...item.frame, name: item.name });
  }
  return generateCabinet({ ...item.params, name: item.name });
}

/** Fondo total del mueble cerrado: puertas y frentes de cajón van por fuera de la caja. */
export const frontDepth = (p: CabinetParams): Millimeters => p.depth + ((p.doors ?? 0) > 0 || (p.drawers ?? 0) > 0 ? (p.boardThickness ?? 18) : 0) + (p.countertop ? p.countertop.overhang ?? 20 : 0);

/** Cuánto mide la habitación desde un muro hasta el de enfrente. */
export const roomSpan = (room: Room, wall: WallSide): Millimeters => (wall === "north" || wall === "south" ? room.depth : room.width);

/** Volumen cerrado del mueble (incluye el espesor de las puertas) en el mundo. */
export function itemBox(room: Room, item: PlacedItem): AABB {
  const p = item.params;
  return localToWorld({ min: [0, 0, 0], max: [p.width, p.height, frontDepth(p)] }, itemTransform(room, item));
}

/** Comprueba que el mueble cabe a lo largo de su muro, en altura y hacia el interior del cuarto. */
function assertFits(room: Room, it: Pick<PlacedItem, "wall" | "offset" | "elevation" | "gap" | "params">): void {
  const len = wallLength(room, it.wall), gap = it.gap ?? 0;
  if (it.offset < 0 || it.offset + it.params.width > len) throw new Error(`No cabe: ocuparía de ${it.offset} a ${it.offset + it.params.width} mm y el ${WALL_NAMES[it.wall]} mide ${len} mm.`);
  if (it.elevation < 0 || it.elevation + it.params.height > room.height) throw new Error(`No cabe en altura: llegaría a ${it.elevation + it.params.height} mm y la habitación mide ${room.height} mm.`);
  const reach = gap + frontDepth(it.params);
  if (gap < 0 || reach > roomSpan(room, it.wall)) throw new Error(`No cabe: separado ${gap} mm del ${WALL_NAMES[it.wall]} llegaría a ${reach} mm y el cuarto mide ${roomSpan(room, it.wall)} mm en ese sentido.`);
}

// ---------- Colocar y consultar ----------

export interface PlaceInput {
  roomId: string;
  wall: WallSide;
  offset: Millimeters;
  elevation?: Millimeters;
  /** Separación del muro, para muebles sueltos en el cuarto. */
  gap?: Millimeters;
  name?: string;
  params: CabinetParams;
  /** Si viene, se coloca una estructura de tubo en vez de un mueble de tablero. */
  frame?: FrameOptions;
}

/** Coloca un mueble de tablero o, con `frame`, una estructura de tubo, con la espalda contra un muro. */
export function placeCabinet(world: World, input: PlaceInput): PlacedItem {
  const room = getRoom(world, input.roomId);
  const elevation = input.elevation ?? 0;
  assertFits(room, { wall: input.wall, offset: input.offset, elevation, gap: input.gap, params: input.params });
  const kind = input.frame ? "frame" : "cabinet";
  const name = input.name ?? (input.frame ? (input.frame.type === "shelving" ? "Estantería de tubo" : "Mesa de tubo") : `Gabinete ${input.params.width}`);
  itemModel({ kind, params: input.params, frame: input.frame, name }); // valida medidas
  const item: PlacedItem = { id: uniqueId(slug(name), world.items.map((i) => i.id)), name, roomId: room.id, kind, params: input.params, ...(input.frame ? { frame: input.frame } : {}), wall: input.wall, offset: input.offset, elevation, ...(input.gap ? { gap: input.gap } : {}) };
  world.items.push(item);
  return item;
}

export interface ItemPatch {
  name?: string;
  wall?: WallSide;
  offset?: Millimeters;
  elevation?: Millimeters;
  /** Separación del muro; 0 lo pega al muro. */
  gap?: Millimeters;
  params?: Partial<CabinetParams>;
  frame?: Partial<FrameOptions>;
}

/** Modifica un mueble ya colocado. Valida que siga cabiendo; si no, lanza un error y no cambia nada. */
export function updateItem(world: World, itemId: string, patch: ItemPatch): PlacedItem {
  const item = world.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No existe el mueble "${itemId}".`);
  const room = getRoom(world, item.roomId);
  const { frame: framePatch, params: paramsPatch, ...rest } = patch;
  const frame: FrameOptions | undefined = item.frame || framePatch ? { type: "table", ...item.frame, ...framePatch } : undefined;
  const next: PlacedItem = { ...item, ...rest, params: { ...item.params, ...paramsPatch }, ...(frame ? { frame } : {}) };
  assertFits(room, next);
  itemModel(next); // valida que el resultado se pueda construir
  Object.assign(item, next);
  if (!item.gap) delete item.gap;
  return item;
}

/** Sentido de giro a la derecha visto desde arriba: el frente pasa de mirar al sur a mirar al oeste, y así. */
const CLOCKWISE: Record<WallSide, WallSide> = { north: "east", east: "south", south: "west", west: "north" };

/** Centro de la huella del mueble, visto desde un muro: a cuánto queda a lo largo del muro y a cuánto de él. */
function centerFrom(room: Room, wall: WallSide, cx: number, cz: number): { along: number; away: number } {
  const [ox, oz] = room.origin;
  switch (wall) {
    case "north": return { along: cx - ox, away: cz - oz };
    case "south": return { along: ox + room.width - cx, away: oz + room.depth - cz };
    case "east": return { along: cz - oz, away: ox + room.width - cx };
    case "west": return { along: oz + room.depth - cz, away: cx - ox };
  }
}

/**
 * Gira el mueble cuartos de vuelta a la derecha sin moverlo de sitio: conserva el centro de su huella.
 * Si girado se sale del cuarto, se corre lo justo para caber; si ni así cabe, lanza un error y no cambia nada.
 */
export function rotateItem(world: World, itemId: string, quarterTurns = 1): PlacedItem {
  const item = world.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No existe el mueble "${itemId}".`);
  const room = getRoom(world, item.roomId);
  const box = itemBox(room, item);
  const cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2;
  let wall = item.wall;
  for (let i = 0; i < (((quarterTurns % 4) + 4) % 4); i++) wall = CLOCKWISE[wall];
  const w = item.params.width, f = frontDepth(item.params);
  if (w > wallLength(room, wall) || f > roomSpan(room, wall)) throw new Error(`${item.name} no cabe girado: mide ${w} x ${f} mm y el cuarto ${wallLength(room, wall)} x ${roomSpan(room, wall)} mm en ese sentido.`);
  const c = centerFrom(room, wall, cx, cz);
  const clamp = (v: number, max: number) => Math.round(Math.min(Math.max(v, 0), max));
  return updateItem(world, itemId, { wall, offset: clamp(c.along - w / 2, wallLength(room, wall) - w), gap: clamp(c.away - f / 2, roomSpan(room, wall) - f) });
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
  for (const b of next.blocks ?? []) {
    if (b.x + b.width > next.width || b.z + b.depth > next.depth) throw new Error(`Con esas medidas ya no cabe ${b.name}. Muévela o quítala primero.`);
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
export function spanOnWall(room: Room, wall: WallSide, box: AABB): [number, number] {
  const [ox, oz] = room.origin;
  switch (wall) {
    case "north": return [box.min[0] - ox, box.max[0] - ox];
    case "south": return [ox + room.width - box.max[0], ox + room.width - box.min[0]];
    case "east": return [box.min[2] - oz, box.max[2] - oz];
    case "west": return [oz + room.depth - box.max[2], oz + room.depth - box.min[2]];
  }
}

/** Distancia de una caja a la cara interior del muro. */
export function distanceToWall(room: Room, wall: WallSide, box: AABB): number {
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
    for (const o of effectiveOpenings(world, room, wall)) {
      const blocks = o.type !== "window" ? elevation < o.sill + o.height : top > o.sill && elevation < o.sill + o.height;
      if (blocks) blocked.push([o.offset, o.offset + o.width]);
    }
    for (const b of room.blocks ?? []) {
      const span = blockOnWall(room, b, wall);
      if (span && (b.height ?? room.height) > elevation) blocked.push(span);
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
/** Ancho mínimo para pasar junto a un mueble, y hueco tan angosto que ya no cuenta como paso. */
const MIN_PASSAGE = 600, DEAD_GAP = 150;

export function checkWorld(world: World): WorldIssue[] {
  const issues: WorldIssue[] = [];
  for (const room of world.rooms) {
    const items = world.items.filter((i) => i.roomId === room.id);
    const walls = wallBoxes(room);
    // Un muro compartido no tiene grosor de este lado: el obstáculo real es el muro de la vecina.
    const solidWall = (w: WallSide): AABB => {
      if (room.wallThickness[w] > 0) return walls[w];
      const adj = adjacentWall(world, room, w);
      return adj ? wallBoxes(adj.room)[adj.wall] : walls[w];
    };
    const boxes = new Map(items.map((i) => [i.id, itemBox(room, i)]));
    const solids = (room.blocks ?? []).map((b) => ({ block: b, box: blockBox(room, b) }));

    for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
      if (overlaps(boxes.get(items[a].id)!, boxes.get(items[b].id)!, 1)) {
        issues.push({ level: "error", code: "items-overlap", itemId: items[a].id, roomId: room.id, message: `${items[a].name} y ${items[b].name} se solapan en ${room.name}.` });
      }
    }

    issues.push(...electricalIssues(world, room));

    for (const item of items) {
      const box = boxes.get(item.id)!;
      for (const s of solids) {
        if (overlaps(box, s.box, 1)) issues.push({ level: "error", code: "hits-block", itemId: item.id, roomId: room.id, message: `${item.name} se mete en ${s.block.name} en ${room.name}.` });
      }
      const free = (item.gap ?? 0) > 50;
      // Se mira cada muro, no solo el del mueble: uno suelto, o uno en esquina, también puede quedar frente a una puerta.
      for (const w of Object.keys(walls) as WallSide[]) {
        const away = distanceToWall(room, w, box);
        const [s0, s1] = spanOnWall(room, w, box);
        for (const o of effectiveOpenings(world, room, w)) {
          if (s1 <= o.offset || s0 >= o.offset + o.width) continue;
          const vertical = box.max[1] > o.sill && box.min[1] < o.sill + o.height;
          if (!vertical) continue;
          const what = o.type === "window" ? "la ventana" : o.type === "door" ? "la puerta" : "el paso";
          if (away <= 50) {
            issues.push({ level: o.type === "window" ? "warning" : "error", code: o.type === "window" ? "blocks-window" : "blocks-door", itemId: item.id, roomId: room.id, message: `${item.name} tapa ${what} del ${WALL_NAMES[o.wall]} en ${room.name}.` });
          } else if (o.type !== "window" && away < MIN_PASSAGE + 300) {
            issues.push({ level: "warning", code: "door-clearance", itemId: item.id, roomId: room.id, message: `${item.name} deja solo ${Math.round(away)} mm frente a ${what} del ${WALL_NAMES[o.wall]} en ${room.name}. Para entrar cómodo hacen falta ${MIN_PASSAGE + 300} mm.` });
          }
        }
        // Un mueble suelto deja pasillos a su alrededor: si son muy angostos no se puede pasar.
        if (free && away >= DEAD_GAP && away < MIN_PASSAGE) {
          issues.push({ level: "warning", code: "tight-passage", itemId: item.id, roomId: room.id, message: `Entre ${item.name} y el ${WALL_NAMES[w]} queda un paso de ${Math.round(away)} mm. Lo mínimo para pasar son ${MIN_PASSAGE} mm y lo cómodo 800.` });
        }
      }
      if (free) {
        for (const s of solids) {
          const b = s.box;
          if (box.max[1] <= b.min[1] || b.max[1] <= box.min[1]) continue;
          const sepX = Math.max(box.min[0] - b.max[0], b.min[0] - box.max[0]), sepZ = Math.max(box.min[2] - b.max[2], b.min[2] - box.max[2]);
          const between = sepX < 0 && sepZ >= 0 ? sepZ : sepZ < 0 && sepX >= 0 ? sepX : -1;
          if (between >= DEAD_GAP && between < MIN_PASSAGE) issues.push({ level: "warning", code: "tight-passage", itemId: item.id, roomId: room.id, message: `Entre ${item.name} y ${s.block.name} queda un paso de ${Math.round(between)} mm. Lo mínimo para pasar son ${MIN_PASSAGE} mm y lo cómodo 800.` });
        }
        for (const other of items) {
          if (other.id === item.id || ((other.gap ?? 0) > 50 && other.id < item.id)) continue;
          const b = boxes.get(other.id)!;
          if (box.max[1] <= b.min[1] || b.max[1] <= box.min[1]) continue;
          const sepX = Math.max(box.min[0] - b.max[0], b.min[0] - box.max[0]), sepZ = Math.max(box.min[2] - b.max[2], b.min[2] - box.max[2]);
          // Solo cuenta si están frente a frente: se cruzan en un eje y los separa el otro.
          const between = sepX < 0 && sepZ >= 0 ? sepZ : sepZ < 0 && sepX >= 0 ? sepX : -1;
          if (between >= DEAD_GAP && between < MIN_PASSAGE) issues.push({ level: "warning", code: "tight-passage", itemId: item.id, roomId: room.id, message: `Entre ${item.name} y ${other.name} queda un paso de ${Math.round(between)} mm. Lo mínimo para pasar son ${MIN_PASSAGE} mm y lo cómodo 800.` });
        }
      }

      const t = itemTransform(room, item);
      const obstacles: Obstacle[] = [
        ...(Object.keys(walls) as WallSide[]).map((w) => ({ id: `wall-${w}`, name: WALL_NAMES[w], box: worldToLocal(solidWall(w), t) })),
        ...items.filter((o) => o.id !== item.id).map((o) => ({ id: o.id, name: o.name, box: worldToLocal(boxes.get(o.id)!, t) })),
        ...solids.map((s) => ({ id: `block-${s.block.id}`, name: s.block.name, box: worldToLocal(s.box, t) })),
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
    for (const b of m.bars ?? []) (merged.bars ??= []).push({ ...b, id: `${item.id}/${b.id}`, name: `${item.name} · ${b.name}` });
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
      const ops = effectiveOpenings(world, room, wall).map((o) => `${o.type === "door" ? "puerta" : o.type === "window" ? "ventana" : "paso"} ${o.width}x${o.height} en ${o.offset}–${o.offset + o.width}${o.sill ? `, antepecho ${o.sill}` : ""}${o.ownerRoomId !== room.id ? ` (id ${o.id}, guardada en ${o.ownerRoomId})` : ""}`);
      const adj = adjacentWall(world, room, wall);
      lines.push(`- ${WALL_NAMES[wall]} (${wall}): largo ${wallLength(room, wall)}, grosor ${room.wallThickness[wall]}${adj ? `, compartido con ${adj.room.name} (su ${WALL_NAMES[adj.wall]})` : ""}${ops.length ? `; ${ops.join("; ")}` : ""}`);
    }
    if (room.blocks?.length) {
      lines.push(`Macizos (columnas, buitrones, esquinas cerradas; x desde el muro oeste, z desde el muro norte). Piso libre: ${m2(roomArea(room), 1)} m².`);
      for (const b of room.blocks) lines.push(`- ${b.name} (id: ${b.id}): ${b.width} x ${b.depth}${b.height ? `, alto ${b.height}` : ", hasta el techo"}, x ${b.x}–${b.x + b.width}, z ${b.z}–${b.z + b.depth}`);
    }
    lines.push(...describeElectrical(room));
    const items = world.items.filter((i) => i.roomId === room.id);
    if (items.length) lines.push("Muebles:");
    for (const i of items) {
      const p = i.params;
      if (i.kind === "frame") {
        const meta = itemModel(i).meta as { profile: string; steelKg: number; joint: string };
        lines.push(`- ${i.name} (id: ${i.id}): estructura de tubo ${p.width} x ${p.height} x ${p.depth}, en ${WALL_NAMES[i.wall]} de ${i.offset} a ${i.offset + p.width}${i.gap ? `, suelta, separada ${i.gap} del muro` : ""}; ${i.frame?.type === "shelving" ? `estantería de ${i.frame.levels ?? 4} niveles` : "mesa"}, perfil ${meta.profile}, ${meta.steelKg} kg de acero, ${meta.joint === "weld" ? "soldada" : "atornillada"}${i.frame?.top === false ? ", sin tablero" : ", con tablero"}`);
        continue;
      }
      lines.push(`- ${i.name} (id: ${i.id}): ${p.width} x ${p.height} x ${p.depth}, en ${WALL_NAMES[i.wall]} de ${i.offset} a ${i.offset + p.width}${i.gap ? `, suelto, separado ${i.gap} del muro` : ""}${i.elevation ? `, colgado a ${i.elevation}` : ""}; ${p.doors ?? 0} puerta(s), ${p.shelves ?? 0} repisa(s)${p.dividers ? `, ${p.dividers} división(es)` : ""}${p.drawers ? `, ${p.drawers} cajón(es)` : ""}${p.hangingBar ? ", barra de colgar" : ""}, unión ${p.joinery ?? "confirmat"}`);
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
