import { adjacentWall, getRoom, itemBox, WALL_NAMES, type Opening, type Room, type Site, type WallSide, type World } from "./world.js";

/**
 * Estudio de sol: dónde está el sol a una hora y fecha en el lugar de la casa, cuántas horas de sol
 * directo recibe cada ventana y qué parte del piso ilumina. Fórmulas de posición solar de la NOAA,
 * con error menor de un grado; no cuenta edificios vecinos, árboles, aleros ni cortinas.
 */
type Vec3 = [number, number, number];
const RAD = Math.PI / 180;

/** Ciudades conocidas: latitud, longitud y horas respecto a UTC. */
export const PLACES: Record<string, [string, number, number, number]> = {
  bogota: ["Bogotá", 4.711, -74.072, -5], medellin: ["Medellín", 6.244, -75.581, -5], cali: ["Cali", 3.452, -76.532, -5], barranquilla: ["Barranquilla", 10.964, -74.796, -5],
  cartagena: ["Cartagena", 10.391, -75.479, -5], bucaramanga: ["Bucaramanga", 7.119, -73.123, -5], pereira: ["Pereira", 4.813, -75.696, -5], manizales: ["Manizales", 5.07, -75.514, -5],
  cucuta: ["Cúcuta", 7.894, -72.508, -5], ibague: ["Ibagué", 4.439, -75.232, -5], "santa marta": ["Santa Marta", 11.241, -74.199, -5], villavicencio: ["Villavicencio", 4.142, -73.627, -5],
  pasto: ["Pasto", 1.214, -77.279, -5], armenia: ["Armenia", 4.534, -75.681, -5], neiva: ["Neiva", 2.927, -75.282, -5], monteria: ["Montería", 8.748, -75.881, -5],
  "ciudad de mexico": ["Ciudad de México", 19.433, -99.133, -6], lima: ["Lima", -12.046, -77.043, -5], quito: ["Quito", -0.181, -78.468, -5], caracas: ["Caracas", 10.481, -66.904, -4],
  panama: ["Ciudad de Panamá", 8.983, -79.519, -5], santiago: ["Santiago de Chile", -33.449, -70.669, -4], "buenos aires": ["Buenos Aires", -34.604, -58.382, -3], madrid: ["Madrid", 40.417, -3.704, 1],
};

export interface SunPosition {
  /** Altura sobre el horizonte, en grados. Negativa de noche. */
  altitude: number;
  /** De dónde viene, en grados desde el norte en sentido horario: 90 = este, 180 = sur, 270 = oeste. */
  azimuth: number;
}

const dayOfYear = (date: string) => { const [y, m, d] = date.split("-").map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1; };

/** Posición del sol en un lugar, una fecha (AAAA-MM-DD) y una hora local en minutos desde medianoche. */
export function sunPosition(site: Pick<Site, "latitude" | "longitude" | "utcOffset">, date: string, minutes: number): SunPosition {
  const g = ((2 * Math.PI) / 365) * (dayOfYear(date) - 1 + (minutes / 60 - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const trueSolar = minutes + eqtime + 4 * site.longitude - 60 * site.utcOffset;
  const ha = (trueSolar / 4 - 180) * RAD, lat = site.latitude * RAD;
  const cosZen = Math.min(1, Math.max(-1, Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)));
  const zen = Math.acos(cosZen);
  const denom = Math.cos(lat) * Math.sin(zen);
  let az = Math.abs(denom) < 1e-9 ? 0 : Math.acos(Math.min(1, Math.max(-1, (Math.sin(decl) - Math.sin(lat) * cosZen) / denom))) / RAD;
  if (Math.sin(ha) > 0) az = 360 - az;
  return { altitude: Number((90 - zen / RAD).toFixed(2)), azimuth: Number((((az % 360) + 360) % 360).toFixed(2)) };
}

/** Salida y puesta del sol, en minutos locales desde medianoche. */
export function daylight(site: Pick<Site, "latitude" | "longitude" | "utcOffset">, date: string): { sunrise: number; sunset: number } {
  let sunrise = -1, sunset = -1;
  for (let m = 0; m < 1440; m += 2) {
    const up = sunPosition(site, date, m).altitude > 0;
    if (up && sunrise < 0) sunrise = m;
    if (up) sunset = m;
  }
  return { sunrise, sunset };
}

const COMPASS = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];
export const compassName = (azimuth: number) => COMPASS[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
export const clock = (minutes: number) => { const h = Math.floor(minutes / 60), m = Math.round(minutes % 60); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`; };

/** Dirección hacia el sol en los ejes del modelo (x al este del modelo, y arriba, z al sur del modelo). */
export function sunVector(site: Pick<Site, "north">, pos: SunPosition): Vec3 {
  const a = (pos.azimuth - site.north) * RAD, alt = pos.altitude * RAD;
  return [Math.cos(alt) * Math.sin(a), Math.sin(alt), -Math.cos(alt) * Math.cos(a)];
}

const OUTWARD: Record<WallSide, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
/** Hacia dónde mira de verdad un muro, en grados desde el norte. */
export const wallBearing = (site: Pick<Site, "north">, wall: WallSide) => (site.north + { north: 0, east: 90, south: 180, west: 270 }[wall]) % 360;

/** Recorta un polígono convexo contra un rectángulo (Sutherland–Hodgman). */
function clipToRect(poly: [number, number][], x0: number, z0: number, x1: number, z1: number): [number, number][] {
  const edges: [(p: [number, number]) => boolean, (a: [number, number], b: [number, number]) => [number, number]][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= z0, (a, b) => [a[0] + ((b[0] - a[0]) * (z0 - a[1])) / (b[1] - a[1]), z0]],
    [(p) => p[1] <= z1, (a, b) => [a[0] + ((b[0] - a[0]) * (z1 - a[1])) / (b[1] - a[1]), z1]],
  ];
  let out = poly;
  for (const [inside, cut] of edges) {
    const input = out; out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length];
      if (inside(a)) { out.push(a); if (!inside(b)) out.push(cut(a, b)); } else if (inside(b)) out.push(cut(a, b));
    }
    if (!out.length) return [];
  }
  return out;
}

const polyArea = (p: [number, number][]) => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;

/** ¿Entra sol directo por esa abertura a esa hora? El sol debe estar sobre el horizonte y del lado de afuera del muro. */
export function sunEnters(world: World, room: Room, o: Opening, pos: SunPosition): boolean {
  const site = world.site;
  if (!site || pos.altitude < 2 || adjacentWall(world, room, o.wall)) return false;
  const s = sunVector(site, pos), n = OUTWARD[o.wall];
  return s[0] * n[0] + s[2] * n[1] >= 0.03;
}

/**
 * Mancha de sol que una ventana deja sobre el piso: el polígono (en el mundo, mm) o `null` si a esa hora
 * el sol no entra por ella. Las puertas y pasos cuentan como abiertos; un muro compartido con otra habitación no recibe sol.
 */
export function sunPatch(world: World, room: Room, o: Opening, pos: SunPosition): [number, number][] | null {
  const site = world.site;
  if (!site || !sunEnters(world, room, o, pos)) return null;
  const s = sunVector(site, pos);
  const [ox, oz] = room.origin;
  const at = (u: number): [number, number] => (o.wall === "north" ? [ox + u, oz] : o.wall === "south" ? [ox + room.width - u, oz + room.depth] : o.wall === "east" ? [ox + room.width, oz + u] : [ox, oz + room.depth - u]);
  const corners: [number, number][] = [];
  for (const [u, y] of [[o.offset, o.sill], [o.offset + o.width, o.sill], [o.offset + o.width, o.sill + o.height], [o.offset, o.sill + o.height]]) {
    const [x, z] = at(u), t = y / s[1];
    corners.push([x - t * s[0], z - t * s[2]]);
  }
  const clipped = clipToRect(corners, ox, oz, ox + room.width, oz + room.depth);
  return clipped.length >= 3 && polyArea(clipped) > 2500 ? clipped.map(([x, z]) => [Math.round(x), Math.round(z)]) : null;
}

export interface WindowSun {
  roomId: string; roomName: string; openingId: string; wall: WallSide;
  /** Hacia dónde mira la ventana: "este", "suroeste"... */
  faces: string;
  /** Horas de sol directo ese día, y de qué hora a qué hora (minutos locales). */
  hours: number;
  from?: number;
  to?: number;
  /** Lo más lejos que llega el sol dentro del cuarto, medido desde el muro de la ventana (mm). */
  reach: number;
  /** Muebles sobre los que cae el sol en algún momento del día. */
  items: string[];
}

/** Sol directo por cada ventana de la casa (o de una habitación) en una fecha. Muestrea cada 10 minutos. */
export function sunReport(world: World, date: string, roomId?: string): WindowSun[] {
  const site = world.site;
  if (!site) throw new Error('Falta saber dónde está la casa. Dilo así: "estamos en Bogotá" o "latitud 4,7 longitud -74,1".');
  const { sunrise, sunset } = daylight(site, date);
  const out: WindowSun[] = [];
  for (const room of roomId ? [getRoom(world, roomId)] : world.rooms) {
    const [ox, oz] = room.origin;
    const boxes = world.items.filter((i) => i.roomId === room.id).map((i) => ({ name: i.name, box: itemBox(room, i) }));
    for (const o of room.openings.filter((x) => x.type === "window")) {
      let n = 0, from: number | undefined, to: number | undefined, reach = 0;
      const hit = new Set<string>();
      for (let m = Math.ceil(sunrise / 10) * 10; m <= sunset; m += 10) {
        const pos = sunPosition(site, date, m);
        if (!sunEnters(world, room, o, pos)) continue;
        n++; from ??= m; to = m;
        const patch = sunPatch(world, room, o, pos);
        // Con el sol muy bajo la luz no toca el piso: cruza el cuarto y pega en el muro de enfrente.
        if (!patch) { reach = Math.max(reach, o.wall === "north" || o.wall === "south" ? room.depth : room.width); continue; }
        for (const [x, z] of patch) reach = Math.max(reach, o.wall === "north" ? z - oz : o.wall === "south" ? oz + room.depth - z : o.wall === "east" ? ox + room.width - x : x - ox);
        for (const b of boxes) if (polyArea(clipToRect(patch, b.box.min[0], b.box.min[2], b.box.max[0], b.box.max[2])) > 40000) hit.add(b.name);
      }
      out.push({ roomId: room.id, roomName: room.name, openingId: o.id, wall: o.wall, faces: compassName(wallBearing(site, o.wall)), hours: Number((n / 6).toFixed(1)), ...(from !== undefined ? { from, to } : {}), reach: Math.round(reach), items: [...hit] });
    }
  }
  return out;
}

/** El estudio de un día dicho en frases, para el visor y para la IA. */
export function sunSummary(world: World, date: string, roomId?: string): string[] {
  const site = world.site!;
  const rows = sunReport(world, date, roomId);
  const { sunrise, sunset } = daylight(site, date);
  const lines = [`${site.place ?? `Latitud ${site.latitude}`}, ${date}: amanece a las ${clock(sunrise)} y anochece a las ${clock(sunset)}. El muro norte del modelo mira al ${compassName(site.north)}.`];
  if (!rows.length) lines.push("No hay ventanas que estudiar.");
  for (const r of rows) {
    lines.push(r.hours
      ? `${r.roomName}, ventana del ${WALL_NAMES[r.wall]} (mira al ${r.faces}): ${String(r.hours).replace(".", ",")} h de sol directo, de ${clock(r.from!)} a ${clock(r.to!)}; entra hasta ${(r.reach / 1000).toFixed(1).replace(".", ",")} m.${r.items.length ? ` Le cae a ${r.items.join(", ")}: el sol decolora la melamina y la madera con los años.` : ""}${r.hours >= 3 && /oeste/.test(r.faces) ? " Sol de tarde: es el que más calienta; conviene cortina, persiana o alero." : ""}`
      : `${r.roomName}, ventana del ${WALL_NAMES[r.wall]} (mira al ${r.faces}): sin sol directo ese día.`);
  }
  return lines;
}

/** Fechas de referencia del año: los dos solsticios y un equinoccio. */
export const REFERENCE_DAYS = (year: number): { label: string; date: string }[] => [{ label: "21 de junio", date: `${year}-06-21` }, { label: "21 de marzo", date: `${year}-03-21` }, { label: "21 de diciembre", date: `${year}-12-21` }];

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Lee una consulta de sol: "sol a las 3 pm", "sol el 21 de junio a las 4:30 de la tarde", "sol en diciembre",
 * "quita el sol". Devuelve lo que se dijo; lo que no se diga queda como estaba.
 */
export function parseSunQuery(text: string, year: number): { off?: true; date?: string; minutes?: number } | null {
  const t = plain(text);
  if (!/\b(sol|asoleamiento|asoleo|sombra)\b/.test(t)) return null;
  if (/\b(quita|oculta|apaga|sin)\b/.test(t)) return { off: true };
  const out: { date?: string; minutes?: number } = {};
  const d = t.match(new RegExp(`(?:(\\d{1,2}) de )?(${MONTHS.join("|")})`));
  if (d) out.date = `${year}-${String(MONTHS.indexOf(d[2]) + 1).padStart(2, "0")}-${String(d[1] ? Number(d[1]) : 21).padStart(2, "0")}`;
  const h = t.match(/a las? (\d{1,2})(?:[:.](\d{2}))? ?(am|pm|a\. ?m\.|p\. ?m\.|de la manana|de la tarde|de la noche)?/);
  if (h) {
    let hour = Number(h[1]);
    const suffix = h[3] ?? "";
    if (/pm|p\.|tarde|noche/.test(suffix) && hour < 12) hour += 12;
    else if (!suffix && hour >= 1 && hour <= 6) hour += 12; // "a las 3" casi siempre es de la tarde
    out.minutes = hour * 60 + Number(h[2] ?? 0);
  } else if (/mediodia/.test(t)) out.minutes = 720;
  else if (/\bmanana\b/.test(t)) out.minutes = 540;
  else if (/\btarde\b/.test(t)) out.minutes = 960;
  return out;
}

/** Fija el lugar por ciudad conocida o por coordenadas. Devuelve el sitio guardado. */
export function setSite(world: World, input: { place?: string; latitude?: number; longitude?: number; utcOffset?: number; north?: number }): Site {
  const prev = world.site;
  let next: Site | undefined = prev ? { ...prev } : undefined;
  if (input.place) {
    const key = Object.keys(PLACES).find((k) => plain(input.place!).includes(k));
    if (!key) throw new Error(`No conozco "${input.place}". Ciudades que conozco: ${Object.values(PLACES).map((p) => p[0]).join(", ")}. O dame las coordenadas: "latitud 4,7 longitud -74,1".`);
    const [name, latitude, longitude, utcOffset] = PLACES[key];
    next = { place: name, latitude, longitude, utcOffset, north: prev?.north ?? 0 };
  }
  if (input.latitude !== undefined && input.longitude !== undefined) {
    if (Math.abs(input.latitude) > 66 || Math.abs(input.longitude) > 180) throw new Error("La latitud debe estar entre -66 y 66 grados y la longitud entre -180 y 180.");
    next = { latitude: input.latitude, longitude: input.longitude, utcOffset: input.utcOffset ?? Math.round(input.longitude / 15), north: prev?.north ?? 0 };
  }
  if (!next) throw new Error('Primero dime dónde está la casa: "estamos en Bogotá" o "latitud 4,7 longitud -74,1".');
  if (input.utcOffset !== undefined) next.utcOffset = input.utcOffset;
  if (input.north !== undefined) next.north = ((Math.round(input.north) % 360) + 360) % 360;
  world.site = next;
  return next;
}
