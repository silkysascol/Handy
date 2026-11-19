import type { CabinetParams } from "./generators/cabinet.js";
import { freeWallRuns, getRoom, placeCabinet, WALL_NAMES, type PlacedItem, type WallSide, type World } from "./world.js";

/**
 * Cocina lineal por módulos sobre un muro: bajos con mesón corrido y altos, acomodados a los puntos de
 * agua y gas que ya estén en ese muro. Es un punto de partida para ajustar, no un diseño cerrado.
 */
export interface KitchenOptions {
  roomId: string;
  wall: WallSide;
  /** Dónde arranca, desde la izquierda del muro. Por defecto, el inicio del tramo libre más largo. */
  from?: number;
  /** Largo de la cocina. Por defecto, todo el tramo libre, hasta 4 m. */
  length?: number;
  /** Con muebles altos. Por defecto sí. */
  uppers?: boolean;
}

export interface KitchenModule { name: string; role: "sink" | "stove" | "drawers" | "base" | "upper"; offset: number; elevation: number; params: CabinetParams }
export interface KitchenPlan { wall: WallSide; from: number; length: number; modules: KitchenModule[]; notes: string[] }

/** Medidas de costumbre: bajos de 90 cm de alto y 60 de fondo; altos de 70 x 35, a 1,5 m del piso. */
export const KITCHEN = { baseHeight: 900, baseDepth: 600, upperHeight: 700, upperDepth: 350, upperElevation: 1500, sinkWidth: 800, stoveWidth: 600, maxModule: 800, minModule: 300 } as const;

/** Parte un tramo en módulos iguales de no más de 80 cm (más ancho, la repisa se pandea); el último se queda con lo que sobre de redondear. */
function split(length: number): number[] {
  const n = Math.ceil(length / KITCHEN.maxModule), w = Math.floor(length / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? length - w * (n - 1) : w));
}

/** Calcula la cocina sin tocar el mundo. Lanza un error si en ese muro no cabe ni un módulo. */
export function planKitchen(world: World, opts: KitchenOptions): KitchenPlan {
  const room = getRoom(world, opts.roomId);
  const notes: string[] = [];
  const runs = freeWallRuns(world, room.id, { height: KITCHEN.baseHeight, elevation: 0, minLength: KITCHEN.minModule }).filter((r) => r.wall === opts.wall);
  const run = opts.from !== undefined ? runs.find((r) => opts.from! >= r.from && opts.from! < r.to) : runs.slice().sort((a, b) => b.length - a.length)[0];
  if (!run) throw new Error(`En el ${WALL_NAMES[opts.wall]} de ${room.name} no hay un tramo libre de al menos ${KITCHEN.minModule} mm${opts.from !== undefined ? ` a partir de ${opts.from} mm` : ""}. Mueve lo que estorba o escoge otro muro.`);
  const from = opts.from ?? run.from;
  const room4 = Math.min(run.to - from, 4000);
  const length = Math.min(opts.length ?? room4, run.to - from);
  if (opts.length && opts.length > run.to - from) notes.push(`Pediste ${opts.length} mm y el tramo libre da ${run.to - from}: la cocina quedó de ${length} mm.`);
  if (length < KITCHEN.minModule) throw new Error(`Una cocina de ${length} mm no da ni para un módulo de ${KITCHEN.minModule}.`);
  const to = from + length;

  // Módulos que mandan: el del lavaplatos sobre su desagüe y el de la estufa sobre su gas.
  const onWall = (room.points ?? []).filter((p) => p.wall === opts.wall && p.offset !== undefined && p.offset > from && p.offset < to);
  const drain = onWall.find((p) => p.kind === "drain") ?? onWall.find((p) => p.kind === "water");
  const gas = onWall.find((p) => p.kind === "gas");
  const fixed: { role: "sink" | "stove"; offset: number; width: number }[] = [];
  const centered = (at: number, width: number) => Math.round(Math.min(Math.max(at - width / 2, from), to - width));
  if (drain && length >= KITCHEN.sinkWidth) fixed.push({ role: "sink", offset: centered(drain.offset!, KITCHEN.sinkWidth), width: KITCHEN.sinkWidth });
  else if (drain) notes.push("El tramo es más corto que el módulo del lavaplatos (800 mm): no lo puse.");
  if (gas) {
    const offset = centered(gas.offset!, KITCHEN.stoveWidth);
    const sink = fixed[0];
    if (sink && offset < sink.offset + sink.width && sink.offset < offset + KITCHEN.stoveWidth) notes.push("El punto de gas queda encima del módulo del lavaplatos: no puse módulo de estufa. Separa los puntos al menos 70 cm.");
    else if (length >= (sink ? sink.width : 0) + KITCHEN.stoveWidth) fixed.push({ role: "stove", offset, width: KITCHEN.stoveWidth });
  }
  if (!drain) notes.push('No hay punto de lavaplatos en este tramo: todos los bajos salieron de puertas. Ponlo con "punto de lavaplatos a 1,5 m de la izquierda" y vuelve a pedir la cocina.');
  fixed.sort((a, b) => a.offset - b.offset);

  const base = { height: KITCHEN.baseHeight, depth: KITCHEN.baseDepth, joinery: "minifix" as const, plinthHeight: 100 };
  const modules: KitchenModule[] = [];
  let cursor = from, plain = 0;
  /** `stove` dice de qué lado del tramo queda la estufa, para poner ahí la cajonera. */
  const fill = (start: number, end: number, stove: "before" | "after" | null) => {
    const gap = end - start;
    if (gap <= 0) return;
    if (gap < KITCHEN.minModule) { notes.push(`Queda un remate de ${gap} mm a ${start} mm de la izquierda: se tapa con una regleta del mismo tablero.`); return; }
    let x = start;
    split(gap).forEach((w, i, all) => {
      // Junto a la estufa, cajones para ollas y cubiertos; el resto, puertas.
      const drawers = stove !== null && w >= 400 && i === (stove === "after" ? all.length - 1 : 0) && !modules.some((m) => m.role === "drawers");
      modules.push(drawers
        ? { name: "Cajonera de cocina", role: "drawers", offset: x, elevation: 0, params: { ...base, width: w, drawers: 3, drawerHeight: 240 } }
        : { name: `Bajo ${++plain}`, role: "base", offset: x, elevation: 0, params: { ...base, width: w, doors: w <= 500 ? 1 : 2, shelves: 1 } });
      x += w;
    });
  };
  fixed.forEach((f, i) => {
    fill(cursor, f.offset, f.role === "stove" ? "after" : fixed[i - 1]?.role === "stove" ? "before" : null);
    modules.push(f.role === "sink"
      ? { name: "Bajo lavaplatos", role: "sink", offset: f.offset, elevation: 0, params: { ...base, width: f.width, doors: 2, shelves: 0 } }
      // Abierto: la válvula de gas queda a la mano y ventilada.
      : { name: "Bajo estufa", role: "stove", offset: f.offset, elevation: 0, params: { ...base, width: f.width, doors: 0, shelves: 1 } });
    cursor = f.offset + f.width;
  });
  fill(cursor, to, fixed[fixed.length - 1]?.role === "stove" ? "before" : null);
  modules.sort((a, b) => a.offset - b.offset);

  // Un solo mesón sobre toda la fila: lo lleva el primer módulo y los demás van debajo.
  const first = modules[0], last = modules[modules.length - 1];
  const span = last.offset + last.params.width - first.offset;
  modules.forEach((m, i) => { m.params = i === 0 ? { ...m.params, countertop: { span } } : { ...m.params, underCountertop: true }; });
  if (span > 2440) notes.push(`El mesón mide ${span} mm y no sale de un tablero de 2,44 m: se hace en dos tramos con unión, o se compra postformado o en piedra por metro.`);
  if (modules.some((m) => m.role === "sink")) notes.push("El mesón lleva el calado del lavaplatos: se marca con la plantilla del fabricante y se corta con caladora.");
  if (modules.some((m) => m.role === "stove")) notes.push("El mesón lleva el calado de la estufa si es de empotrar; si es de piso, quita ese módulo y deja el espacio.");

  if (opts.uppers !== false) {
    const stove = modules.find((m) => m.role === "stove");
    const high = freeWallRuns(world, room.id, { height: KITCHEN.upperHeight, elevation: KITCHEN.upperElevation, minLength: KITCHEN.minModule }).filter((r) => r.wall === opts.wall);
    if (KITCHEN.upperElevation + KITCHEN.upperHeight > room.height) notes.push(`El cuarto mide ${room.height} mm de alto: no caben muebles altos a ${KITCHEN.upperElevation} mm.`);
    else {
      let n = 0;
      const spans: [number, number][] = [];
      for (const r of high) {
        const a = Math.max(r.from, from), b = Math.min(r.to, to);
        // Sobre la estufa va la campana, no un mueble.
        if (stove && a < stove.offset + stove.params.width && stove.offset < b) { spans.push([a, stove.offset], [stove.offset + stove.params.width, b]); } else spans.push([a, b]);
      }
      for (const [a, b] of spans) {
        if (b - a < KITCHEN.minModule) continue;
        let x = a;
        for (const w of split(b - a)) { modules.push({ name: `Alto ${++n}`, role: "upper", offset: x, elevation: KITCHEN.upperElevation, params: { width: w, height: KITCHEN.upperHeight, depth: KITCHEN.upperDepth, doors: w <= 500 ? 1 : 2, shelves: 1, joinery: "minifix" } }); x += w; }
      }
      if (stove) notes.push("Sobre la estufa dejé libre para la campana.");
      if (!n) notes.push("No quedó tramo libre para muebles altos: una ventana u otro mueble ocupa esa altura.");
    }
  }
  return { wall: opts.wall, from, length, modules, notes };
}

/** Coloca la cocina en el mundo. Si algún módulo no se puede colocar, no queda ninguno. */
export function buildKitchen(world: World, opts: KitchenOptions): { plan: KitchenPlan; items: PlacedItem[] } {
  const plan = planKitchen(world, opts);
  const before = world.items.length;
  try {
    const items = plan.modules.map((m) => placeCabinet(world, { roomId: opts.roomId, wall: opts.wall, offset: m.offset, elevation: m.elevation, name: m.name, params: m.params }));
    return { plan, items };
  } catch (e) {
    world.items.length = before;
    throw e;
  }
}

/** La cocina dicha en una frase por módulo. */
export function describeKitchen(plan: KitchenPlan): string[] {
  const bases = plan.modules.filter((m) => m.role !== "upper"), uppers = plan.modules.filter((m) => m.role === "upper");
  return [
    `Cocina de ${plan.length} mm en el ${WALL_NAMES[plan.wall]}, desde ${plan.from} mm de la izquierda: ${bases.length} bajo(s) con mesón corrido${uppers.length ? ` y ${uppers.length} alto(s)` : ""}.`,
    `Bajos: ${bases.map((m) => `${m.name} ${m.params.width}`).join(" · ")}.`,
    ...(uppers.length ? [`Altos: ${uppers.map((m) => `${m.name} ${m.params.width}`).join(" · ")}.`] : []),
    ...plan.notes,
  ];
}
