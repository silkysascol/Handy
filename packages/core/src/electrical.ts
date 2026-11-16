import type { Millimeters } from "./model/index.js";
import type { PriceOffer, PriceProvider } from "./providers/types.js";
import { unitCost } from "./providers/types.js";
import type { PriceNeed } from "./pricebook.js";
import {
  blockOnWall, distanceToWall, effectiveOpenings, freeWallRuns, getRoom, itemBox, slug, spanOnWall, uniqueId, wallLength, WALL_NAMES,
  type ElectricPoint, type PointKind, type Room, type WallSide, type World, type WorldIssue,
} from "./world.js";

/**
 * Puntos eléctricos de una habitación: tomas, interruptores, datos y luces, a las alturas habituales;
 * las franjas donde no conviene perforar porque ahí suele ir la tubería; y un estimado de materiales.
 * Son alturas de práctica común, no una revisión de norma: la instalación la valida un electricista.
 */
export const POINT_HEIGHT = {
  /** Toma general, sobre el piso terminado. */
  outlet: 300,
  /** Toma sobre mesón de cocina o lavamanos: unos 20 cm sobre un mesón de 90. */
  counter: 1100,
  switch: 1100,
  data: 300,
} as const;

/** Media franja a cada lado de un punto de pared: la tubería suele subir o bajar en vertical por ahí. */
export const DRILL_BAND = 100;
/** Con tomas repartidas así, ningún punto del muro queda a más de 1,8 m de una. */
export const MAX_OUTLET_SPACING = 3600;

const KIND_NAME: Record<PointKind, string> = { outlet: "Toma", switch: "Interruptor", data: "Punto de datos", light: "Luz" };
const WET = /bano|cocina|lavadero|ropas|patio|terraza|balcon|garaje|lavanderia/;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const isWetRoom = (room: Pick<Room, "name">): boolean => WET.test(norm(room.name));
export const onWall = (p: ElectricPoint): p is ElectricPoint & { wall: WallSide; offset: number; height: number } => p.kind !== "light";

export interface PointInput { kind: PointKind; name?: string; wall?: WallSide; offset?: Millimeters; height?: Millimeters; x?: Millimeters; z?: Millimeters; gfci?: boolean }

function assertPoint(world: World, room: Room, p: ElectricPoint): void {
  if (!onWall(p)) {
    if (p.x === undefined || p.z === undefined || p.x < 0 || p.z < 0 || p.x > room.width || p.z > room.depth) throw new Error(`La luz debe quedar dentro de ${room.name}, que mide ${room.width} x ${room.depth} mm.`);
    const inside = (room.blocks ?? []).find((b) => !b.height && p.x! > b.x && p.x! < b.x + b.width && p.z! > b.z && p.z! < b.z + b.depth);
    if (inside) throw new Error(`Ahí está ${inside.name}: la luz no puede ir dentro.`);
    return;
  }
  const len = wallLength(room, p.wall);
  if (p.offset < 50 || p.offset > len - 50) throw new Error(`No cabe: ${p.name} debe quedar entre 50 y ${len - 50} mm del extremo izquierdo del ${WALL_NAMES[p.wall]}.`);
  if (p.height < 100 || p.height > room.height - 100) throw new Error(`La altura debe estar entre 100 y ${room.height - 100} mm.`);
  for (const o of effectiveOpenings(world, room, p.wall)) {
    if (p.offset > o.offset - 40 && p.offset < o.offset + o.width + 40 && p.height > o.sill - 40 && p.height < o.sill + o.height + 40) throw new Error(`Ahí está ${o.type === "window" ? "la ventana" : o.type === "door" ? "la puerta" : "el paso"} del ${WALL_NAMES[p.wall]}. Corre el punto al menos ${40} mm fuera del vano.`);
  }
  for (const b of room.blocks ?? []) {
    const span = blockOnWall(room, b, p.wall);
    if (span && p.offset > span[0] && p.offset < span[1] && p.height < (b.height ?? room.height)) throw new Error(`Ese tramo del ${WALL_NAMES[p.wall]} lo tapa ${b.name}.`);
  }
}

/** Agrega un punto eléctrico. Sin altura, usa la habitual de su tipo; en zonas húmedas las tomas salen con protección. */
export function addPoint(world: World, roomId: string, input: PointInput): ElectricPoint {
  const room = getRoom(world, roomId);
  const points = room.points ?? [];
  const name = input.name ?? KIND_NAME[input.kind];
  const base = { id: uniqueId(slug(name), points.map((p) => p.id)), name, kind: input.kind };
  const point: ElectricPoint = input.kind === "light"
    ? { ...base, x: Math.round(input.x ?? room.width / 2), z: Math.round(input.z ?? room.depth / 2) }
    : { ...base, wall: input.wall ?? "north", offset: Math.round(input.offset ?? wallLength(room, input.wall ?? "north") / 2), height: Math.round(input.height ?? POINT_HEIGHT[input.kind]), ...(input.kind === "outlet" && (input.gfci ?? isWetRoom(room)) ? { gfci: true } : {}) };
  assertPoint(world, room, point);
  room.points = [...points, point];
  return point;
}

/** Mueve o cambia un punto. Si no cabe o cae en un vano, lanza un error y no cambia nada. */
export function updatePoint(world: World, roomId: string, pointId: string, patch: Partial<Omit<PointInput, "kind">>): ElectricPoint {
  const room = getRoom(world, roomId);
  const point = room.points?.find((p) => p.id === pointId);
  if (!point) throw new Error(`No existe el punto "${pointId}" en ${room.name}.`);
  const next: ElectricPoint = { ...point, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
  if (next.gfci === false) delete next.gfci;
  assertPoint(world, room, next);
  for (const k of Object.keys(point) as (keyof ElectricPoint)[]) delete point[k];
  Object.assign(point, next);
  return point;
}

export function removePoint(world: World, roomId: string, pointId: string): boolean {
  const room = getRoom(world, roomId);
  const before = room.points?.length ?? 0;
  room.points = (room.points ?? []).filter((p) => p.id !== pointId);
  if (!room.points.length) delete room.points;
  return before > (room.points?.length ?? 0);
}

/** Posición del punto en el mundo (mm): sobre la cara del muro, o en el techo. */
export function pointPosition(room: Room, p: ElectricPoint): [number, number, number] {
  const [ox, oz] = room.origin;
  if (!onWall(p)) return [ox + (p.x ?? 0), room.height, oz + (p.z ?? 0)];
  const { wall, offset, height } = p;
  return wall === "north" ? [ox + offset, height, oz] : wall === "south" ? [ox + room.width - offset, height, oz + room.depth] : wall === "east" ? [ox + room.width, height, oz + offset] : [ox, height, oz + room.depth - offset];
}

export interface DrillBand { wall: WallSide; from: Millimeters; to: Millimeters; pointId: string; name: string }

/** Franjas verticales, de piso a techo, por donde suele subir o bajar la tubería de cada punto de pared. */
export function drillBands(room: Room): DrillBand[] {
  return (room.points ?? []).filter(onWall).map((p) => ({ wall: p.wall, from: p.offset - DRILL_BAND, to: p.offset + DRILL_BAND, pointId: p.id, name: p.name }));
}

/** Avisos eléctricos de una habitación: puntos tapados por muebles y muebles que se fijan sobre una franja de tubería. */
export function electricalIssues(world: World, room: Room): WorldIssue[] {
  const issues: WorldIssue[] = [];
  const points = (room.points ?? []).filter(onWall);
  if (!points.length) return issues;
  for (const item of world.items.filter((i) => i.roomId === room.id)) {
    const box = itemBox(room, item);
    for (const wall of ["north", "east", "south", "west"] as WallSide[]) {
      if (distanceToWall(room, wall, box) > 50) continue;
      const [s0, s1] = spanOnWall(room, wall, box);
      // Un mueble alto o colgado se fija al muro con tornillos: ahí es donde importa la tubería.
      const fixed = item.elevation > 0 || item.params.height > 1200;
      for (const p of points.filter((x) => x.wall === wall)) {
        const covered = p.offset > s0 - 40 && p.offset < s1 + 40 && p.height > box.min[1] - 60 && p.height < box.max[1] + 60;
        if (covered) {
          issues.push({ level: "warning", code: "point-covered", itemId: item.id, roomId: room.id, message: p.kind === "switch" ? `${item.name} tapa ${p.name.toLowerCase()} del ${WALL_NAMES[wall]} en ${room.name}: no se podrá accionar. Corre el mueble o el interruptor.` : `${item.name} tapa ${p.name.toLowerCase()} del ${WALL_NAMES[wall]} en ${room.name}. Si la necesitas, corre el mueble o hazle un calado en el fondo.` });
        } else if (fixed && p.offset + DRILL_BAND > s0 && p.offset - DRILL_BAND < s1) {
          issues.push({ level: "warning", code: "drill-band", itemId: item.id, roomId: room.id, message: `${item.name} se fija al ${WALL_NAMES[wall]} sobre la vertical de ${p.name.toLowerCase()} (a ${p.offset} mm de la izquierda): por ahí suele pasar la tubería. No perfores en esa franja de ${2 * DRILL_BAND} mm, o comprueba antes con un detector.` });
        }
      }
    }
  }
  return issues;
}

/**
 * Reparte tomas generales por los tramos libres de muro para que ningún punto quede a más de 1,8 m de una.
 * No pone donde hay puertas, columnas ni muebles, ni junto a una toma que ya exista.
 */
export function spreadOutlets(world: World, roomId: string): ElectricPoint[] {
  const room = getRoom(world, roomId);
  const made: ElectricPoint[] = [];
  for (const run of freeWallRuns(world, roomId, { height: 400, elevation: 0, minLength: 600 })) {
    const n = Math.ceil(run.length / MAX_OUTLET_SPACING);
    for (let i = 0; i < n; i++) {
      const offset = Math.round(run.from + (run.length * (2 * i + 1)) / (2 * n));
      if ((room.points ?? []).some((p) => p.kind === "outlet" && p.wall === run.wall && Math.abs((p.offset ?? 0) - offset) < MAX_OUTLET_SPACING / 2 - 1)) continue;
      try { made.push(addPoint(world, roomId, { kind: "outlet", wall: run.wall, offset })); } catch { /* ese sitio no sirve: se deja sin toma */ }
    }
  }
  return made;
}

export interface ElectricalTakeoff { outlets: number; gfci: number; switches: number; data: number; lights: number; boxes: number; conduitM: number; wireM: number }

/**
 * Materiales estimados: una caja por punto, y tubería desde cada punto hasta el techo y de ahí a la luz
 * más cercana (o al centro del cuarto). El cable son tres hilos por tubo más un 10 %. Es un estimado
 * para presupuestar; el recorrido real lo define quien instala.
 */
export function electricalTakeoff(room: Room): ElectricalTakeoff {
  const points = room.points ?? [];
  const lights = points.filter((p) => p.kind === "light");
  const hubs = lights.length ? lights.map((l) => [l.x ?? 0, l.z ?? 0]) : [[room.width / 2, room.depth / 2]];
  const nearest = (x: number, z: number, skip = -1) => Math.min(...hubs.filter((_, i) => i !== skip).map(([hx, hz]) => Math.abs(hx - x) + Math.abs(hz - z)));
  let mm = 0;
  for (const p of points.filter(onWall)) {
    const [x, , z] = pointPosition({ ...room, origin: [0, 0] }, p);
    mm += room.height - p.height + nearest(x, z);
  }
  // Las luces se encadenan entre sí; la primera sale del tablero, que aquí no se conoce.
  lights.forEach((l, i) => { if (lights.length > 1 && i > 0) mm += nearest(l.x ?? 0, l.z ?? 0, i); });
  const conduitM = Number((mm / 1000).toFixed(1));
  const count = (k: PointKind) => points.filter((p) => p.kind === k).length;
  return { outlets: count("outlet"), gfci: points.filter((p) => p.gfci).length, switches: count("switch"), data: count("data"), lights: lights.length, boxes: points.length, conduitM, wireM: Number((conduitM * 3 * 1.1).toFixed(1)) };
}

export interface ElectricalQuoteLine { description: string; category: string; qty: number; unit: PriceOffer["unit"]; unitPrice: number; total: number; offer?: PriceOffer; missing: boolean; need: PriceNeed }

/** Renglones de presupuesto de la instalación eléctrica de una habitación. */
export async function quoteElectrical(roomName: string, t: ElectricalTakeoff, providers: PriceProvider[]): Promise<ElectricalQuoteLine[]> {
  const rows: [string, string, number, PriceOffer["unit"], PriceNeed["attributes"]?][] = [
    ["Toma doble con polo a tierra", "outlet", t.outlets - t.gfci, "unit", { gfci: false }],
    ["Toma con protección de falla a tierra (GFCI)", "outlet", t.gfci, "unit", { gfci: true }],
    ["Interruptor sencillo", "switch", t.switches, "unit"],
    ["Toma de datos o TV", "data-outlet", t.data, "unit"],
    ["Roseta o plafón para luz", "lamp-holder", t.lights, "unit"],
    ["Caja eléctrica 2 x 4", "electrical-box", t.boxes, "unit"],
    ["Tubería conduit de 1/2 pulgada (m, estimado)", "conduit", Math.ceil(t.conduitM), "meter"],
    ["Cable de cobre calibre 12 (m, estimado)", "wire", Math.ceil(t.wireM), "meter"],
  ];
  const out: ElectricalQuoteLine[] = [];
  for (const [label, category, count, unit, attributes] of rows) {
    if (count <= 0) continue;
    const offers = (await Promise.all(providers.map((p) => p.search({ category }).catch(() => [] as PriceOffer[])))).flat();
    const offer = offers.filter((o) => attributes?.gfci === undefined || Boolean(o.attributes?.gfci) === attributes.gfci).sort((a, b) => unitCost(a) - unitCost(b))[0];
    const qty = offer?.unit === "pack" && offer.packSize ? Math.ceil(count / offer.packSize) : count;
    out.push({ description: `${roomName} · ${label}`, category, qty, unit: offer?.unit ?? unit, unitPrice: offer?.price ?? 0, total: (offer?.price ?? 0) * qty, offer, missing: !offer, need: { category, unit, ...(attributes ? { attributes } : {}) } });
  }
  return out;
}

/** Los puntos de una habitación, dichos para la IA. */
export function describeElectrical(room: Room): string[] {
  if (!room.points?.length) return [];
  const t = electricalTakeoff(room);
  return [
    `Eléctrico (alturas sobre piso terminado; estimado ${t.conduitM} m de tubería y ${t.wireM} m de cable):`,
    ...room.points.map((p) => (onWall(p) ? `- ${p.name} (id: ${p.id}): ${WALL_NAMES[p.wall]}, a ${p.offset} de la izquierda y ${p.height} de alto${p.gfci ? ", con protección GFCI" : ""}` : `- ${p.name} (id: ${p.id}): en el techo, a ${p.x} del muro oeste y ${p.z} del muro norte`)),
  ];
}
