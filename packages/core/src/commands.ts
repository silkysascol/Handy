import type { Joinery } from "./model/index.js";
import { defaultFloorSpec, planFloor, type FloorSpec } from "./flooring.js";
import {
  addOpening, addRoom, getRoom, placeCabinet, removeItem, removeOpening, updateItem, updateOpening, updateRoom,
  wallLength, WALL_NAMES, type WallSide, type World,
} from "./world.js";

/**
 * Comandos en español acotados a lo que el usuario tiene seleccionado. La idea: hacer clic en un muro
 * y escribir "pon una puerta de 80 x 205 a 2 m de la izquierda". Es un intérprete determinista y pequeño;
 * lo que no entiende se devuelve con `understood: false` para que lo resuelva la IA del usuario.
 */
export type Selection =
  | { kind: "wall"; roomId: string; wall: WallSide }
  | { kind: "item"; itemId: string }
  | { kind: "opening"; roomId: string; openingId: string }
  | { kind: "room"; roomId: string }
  /** Nada seleccionado: órdenes sobre el mundo, como crear una habitación. */
  | { kind: "world" };

export interface CommandResult {
  ok: boolean;
  /** false = el intérprete local no reconoció la orden; pásala a la IA. */
  understood: boolean;
  message: string;
  /** Qué debería quedar seleccionado tras el cambio. null = nada (se borró). */
  select?: Selection | null;
}

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/(\d),(\d)/g, "$1.$2").replace(/\s+/g, " ").trim();

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const UNIT = String.raw`(mm|milimetros?|cm|centimetros?|metros?|mts?|m)?`;

/**
 * Convierte a milímetros. Sin unidad se interpreta como se habla en obra: menos de 10 son metros ("a 2
 * de la izquierda"), menos de 300 son centímetros ("puerta de 80 x 205", "antepecho 110") y el resto
 * milímetros ("ancho 900"). La respuesta siempre repite la medida en mm para que el usuario la confirme.
 */
export function toMm(value: number, unit?: string): number {
  const u = unit ?? "";
  if (u.startsWith("mm") || u.startsWith("mil")) return Math.round(value);
  if (u.startsWith("cm") || u.startsWith("cen")) return Math.round(value * 10);
  if (u.startsWith("m")) return Math.round(value * 1000);
  if (value < 10) return Math.round(value * 1000);
  if (value < 300) return Math.round(value * 10);
  return Math.round(value);
}

/** "80 x 205 cm", "800x2000x500": la unidad del último número vale para los que no traen. */
function parseDims(t: string): number[] | undefined {
  const m = t.match(new RegExp(`${NUM} ?${UNIT} ?(?:x|por) ?${NUM} ?${UNIT}(?: ?(?:x|por) ?${NUM} ?${UNIT})?`));
  if (!m) return undefined;
  const raw: [string, string | undefined][] = [[m[1], m[2]], [m[3], m[4]]];
  if (m[5]) raw.push([m[5], m[6]]);
  const lastUnit = [...raw].reverse().find(([, u]) => u)?.[1];
  // Sin ninguna unidad, el grupo entero comparte escala: "800 x 2000 x 250" son todos milímetros.
  const groupUnit = lastUnit ?? (Math.max(...raw.map(([v]) => Number(v))) >= 300 ? "mm" : undefined);
  return raw.map(([v, u]) => toMm(Number(v), u ?? groupUnit));
}

/** Longitud que sigue a una palabra clave: lengthAfter("grosor de 20 cm", "grosor") → 200. */
function lengthAfter(t: string, keyword: string): number | undefined {
  const m = t.match(new RegExp(`(?:${keyword})(?: de| a| en)? ${NUM} ?${UNIT}`));
  return m ? toMm(Number(m[1]), m[2]) : undefined;
}

/** "a 1,5 m del piso" → 1500 */
function fromFloor(t: string): number | undefined {
  const m = t.match(new RegExp(`a ${NUM} ?${UNIT} del (?:piso|suelo)`));
  return m ? toMm(Number(m[1]), m[2]) : undefined;
}

function firstLength(t: string): number | undefined {
  const m = t.match(new RegExp(`${NUM} ?${UNIT}(?![\\d.])`));
  return m ? toMm(Number(m[1]), m[2]) : undefined;
}

const WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8 };
function countOf(t: string, noun: string): number | undefined {
  if (new RegExp(`sin ${noun}`).test(t)) return 0;
  const m = t.match(new RegExp(`(\\d+|${Object.keys(WORDS).join("|")}) ${noun}`));
  if (!m) return undefined;
  return WORDS[m[1]] ?? Number(m[1]);
}

type Anchor = { from: "left" | "right"; distance: number } | { from: "center" } | undefined;
function parseAnchor(t: string): Anchor {
  if (/centrad[ao]|al centro|en el centro|centra(l[ao])?\b/.test(t)) return { from: "center" };
  const m = t.match(new RegExp(`a ${NUM} ?${UNIT} (?:de|desde) (?:la |el )?(?:pared |muro |esquina |lado |borde |extremo )?(izquierd[ao]|derech[ao])`));
  if (m) return { from: m[3].startsWith("izq") ? "left" : "right", distance: toMm(Number(m[1]), m[2]) };
  if (/pegad[ao] a la izquierda|contra la izquierda|en la esquina izquierda|desde la izquierda/.test(t)) return { from: "left", distance: 0 };
  if (/pegad[ao] a la derecha|contra la derecha|en la esquina derecha|desde la derecha/.test(t)) return { from: "right", distance: 0 };
  return undefined;
}

const offsetFor = (anchor: Anchor, len: number, width: number): number =>
  !anchor || anchor.from === "center" ? Math.round((len - width) / 2) : anchor.from === "left" ? anchor.distance : len - anchor.distance - width;

const describeAnchor = (anchor: Anchor, offset: number) => (!anchor || anchor.from === "center" ? `centrada, a ${offset} mm de la izquierda` : `a ${offset} mm de la izquierda`);

const FURNITURE = /gabinete|mueble|armario|closet|estante|estanteria|biblioteca|repisero|alacena|modulo/;
const DELETE = /\b(borra|borrar|borral[ao]|quita|quitar|quital[ao]|elimina|eliminar|eliminal[ao]|saca|sacal[ao])\b/;
const fail = (message: string): CommandResult => ({ ok: false, understood: true, message });
const unknown = (hint: string): CommandResult => ({ ok: false, understood: false, message: `No entendí esa orden. ${hint}` });

export function runCommand(world: World, selection: Selection, text: string): CommandResult {
  const t = norm(text);
  if (!t) return unknown("Escribe qué quieres cambiar.");
  try {
    switch (selection.kind) {
      case "wall": return wallCommand(world, selection, t);
      case "item": return itemCommand(world, selection, t);
      case "opening": return openingCommand(world, selection, t);
      case "room": return roomCommand(world, selection, t);
      case "world": return worldCommand(world, t);
    }
  } catch (e) {
    return fail((e as Error).message);
  }
}

function wallCommand(world: World, sel: Extract<Selection, { kind: "wall" }>, t: string): CommandResult {
  const room = getRoom(world, sel.roomId);
  const len = wallLength(room, sel.wall);
  const anchor = parseAnchor(t);
  const dims = parseDims(t);

  if (FURNITURE.test(t)) {
    const word = t.match(FURNITURE)![0];
    const [width, height, depth] = [dims?.[0] ?? lengthAfter(t, "ancho") ?? 800, dims?.[1] ?? lengthAfter(t, "alto|altura") ?? 2000, dims?.[2] ?? lengthAfter(t, "fondo|profundidad|prof") ?? 500];
    const elevation = fromFloor(t) ?? lengthAfter(t, "colgad[ao]|elevad[ao]") ?? 0;
    const offset = offsetFor(anchor, len, width);
    const joinery: Joinery = /confirmat/.test(t) ? "confirmat" : /tarugo/.test(t) ? "dowel" : "minifix";
    const item = placeCabinet(world, {
      roomId: room.id, wall: sel.wall, offset, elevation,
      name: word.charAt(0).toUpperCase() + word.slice(1),
      params: { width, height, depth, doors: (Math.min(countOf(t, "puertas?") ?? 0, 2)) as 0 | 1 | 2, shelves: countOf(t, "repisas?|entrepanos?") ?? 0, plinthHeight: lengthAfter(t, "zocalo") ?? 0, joinery },
    });
    return { ok: true, understood: true, select: { kind: "item", itemId: item.id }, message: `${item.name} de ${width} x ${height} x ${depth} mm en el ${WALL_NAMES[sel.wall]}, ${describeAnchor(anchor, offset)}${elevation ? `, a ${elevation} mm del piso` : ""}.` };
  }

  const type = /ventana/.test(t) ? "window" : /puerta/.test(t) ? "door" : /\b(paso|vano|abertura|arco)\b/.test(t) ? "pass" : undefined;
  if (type) {
    const def = type === "window" ? [1200, 1200] : type === "door" ? [800, 2050] : [900, 2100];
    const width = dims?.[0] ?? lengthAfter(t, "ancho") ?? (dims ? def[0] : lengthAfter(t, "puerta|ventana|paso|vano") ?? def[0]);
    const height = dims?.[1] ?? lengthAfter(t, "alto|altura") ?? def[1];
    const sill = type === "window" ? lengthAfter(t, "antepecho|alfeizar") ?? fromFloor(t) ?? 1000 : 0;
    const offset = offsetFor(anchor, len, width);
    const o = addOpening(world, room.id, { wall: sel.wall, type, offset, width, height, sill });
    const what = type === "window" ? "Ventana" : type === "door" ? "Puerta" : "Paso";
    return { ok: true, understood: true, select: { kind: "opening", roomId: room.id, openingId: o.id }, message: `${what} de ${width} x ${height} mm en el ${WALL_NAMES[sel.wall]}, ${describeAnchor(anchor, offset)}${sill ? `, antepecho ${sill} mm` : ""}.` };
  }

  const thickness = lengthAfter(t, "grosor|espesor");
  if (thickness !== undefined) {
    updateRoom(world, room.id, { wallThickness: { [sel.wall]: thickness } });
    return { ok: true, understood: true, message: `Grosor del ${WALL_NAMES[sel.wall]}: ${thickness} mm.` };
  }
  return unknown('En un muro puedes: "pon una puerta de 80 x 205 a 2 m de la izquierda", "ventana de 120 x 100 centrada, antepecho 100", "armario de 800 x 2000 x 500 a 60 cm de la derecha con 2 puertas y 3 repisas", "grosor 20 cm".');
}

function itemCommand(world: World, sel: Extract<Selection, { kind: "item" }>, t: string): CommandResult {
  const item = world.items.find((i) => i.id === sel.itemId);
  if (!item) return fail(`No existe el mueble "${sel.itemId}".`);
  const room = getRoom(world, item.roomId);
  const len = wallLength(room, item.wall);
  const p = item.params;
  const L = firstLength(t);
  const done = (message: string): CommandResult => ({ ok: true, understood: true, select: sel, message });

  if (DELETE.test(t) && !/repisa|puerta|zocalo|entrepano/.test(t)) {
    removeItem(world, item.id);
    return { ok: true, understood: true, select: null, message: `${item.name} quitado.` };
  }

  // Repisas y puertas
  if (/repisa|entrepano/.test(t)) {
    const n = countOf(t, "repisas?|entrepanos?") ?? 1;
    const shelves = /agrega|anade|pon|suma|\bmas\b/.test(t) ? (p.shelves ?? 0) + n : DELETE.test(t) ? Math.max(0, (p.shelves ?? 0) - n) : n;
    updateItem(world, item.id, { params: { shelves } });
    return done(`${item.name}: ${shelves} repisa(s).`);
  }
  if (/puerta/.test(t)) {
    const n = countOf(t, "puertas?");
    const doors = (DELETE.test(t) && n === undefined ? 0 : Math.min(n ?? 1, 2)) as 0 | 1 | 2;
    updateItem(world, item.id, { params: { doors } });
    return done(`${item.name}: ${doors === 0 ? "sin puertas" : `${doors} puerta(s)`}.`);
  }
  if (/zocalo/.test(t)) {
    // Un zócalo mide 5 a 15 cm: un número suelto mayor de 20 se toma en milímetros.
    const bare = t.match(new RegExp(`zocalo(?: de| a)? ${NUM}(?![\\d.])(?! ?(?:mm|cm|m))`));
    const plinthHeight = /sin zocalo/.test(t) || DELETE.test(t) ? 0 : bare ? (Number(bare[1]) > 20 ? Math.round(Number(bare[1])) : Math.round(Number(bare[1]) * 10)) : L ?? 80;
    updateItem(world, item.id, { params: { plinthHeight } });
    return done(`${item.name}: ${plinthHeight ? `zócalo de ${plinthHeight} mm` : "sin zócalo"}.`);
  }
  if (/sin tornillos|tornillos ocultos|minifix/.test(t)) { updateItem(world, item.id, { params: { joinery: "minifix" } }); return done(`${item.name}: unión minifix, sin tornillos a la vista.`); }
  if (/confirmat/.test(t)) { updateItem(world, item.id, { params: { joinery: "confirmat" } }); return done(`${item.name}: unión confirmat.`); }
  if (/tarugo/.test(t)) { updateItem(world, item.id, { params: { joinery: "dowel" } }); return done(`${item.name}: unión con tarugos.`); }

  // Posición a lo largo del muro
  const anchor = parseAnchor(t);
  if (/muev|corre|desplaza|ponl[oa]|ubical[oa]|pegal[oa]|central[oa]|centra\b/.test(t) || (anchor && !/ancho|alto|fondo|profund/.test(t))) {
    let offset: number | undefined;
    if (anchor) offset = offsetFor(anchor, len, p.width);
    else if (/pegal[oa].*izquierda/.test(t)) offset = 0;
    else if (/pegal[oa].*derecha/.test(t)) offset = len - p.width;
    else if (L !== undefined && /derecha/.test(t)) offset = item.offset + L;
    else if (L !== undefined && /izquierda/.test(t)) offset = item.offset - L;
    if (offset !== undefined) {
      updateItem(world, item.id, { offset });
      return done(`${item.name}: ahora de ${offset} a ${offset + p.width} mm en el ${WALL_NAMES[item.wall]}.`);
    }
  }

  // Altura sobre el piso
  if (/al piso|en el piso|apoyal[oa]/.test(t)) { updateItem(world, item.id, { elevation: 0 }); return done(`${item.name}: apoyado en el piso.`); }
  const floorDist = fromFloor(t);
  if (floorDist !== undefined) { updateItem(world, item.id, { elevation: floorDist }); return done(`${item.name}: a ${floorDist} mm del piso.`); }
  if (L !== undefined && /\bsub[ei]|levanta|eleva/.test(t) && !/altura|alto/.test(t)) { updateItem(world, item.id, { elevation: item.elevation + L }); return done(`${item.name}: a ${item.elevation} mm del piso.`); }
  if (L !== undefined && /\bbaja(l[oa])?\b/.test(t) && !/altura|alto/.test(t)) { updateItem(world, item.id, { elevation: Math.max(0, item.elevation - L) }); return done(`${item.name}: a ${item.elevation} mm del piso.`); }

  // Medidas: relativas ("más ancho 10 cm", "ensancha") o absolutas ("ancho 900")
  if (L !== undefined) {
    const dim = /ensanch|ancho|angost|estrech/.test(t) ? "width" : /alto|altura|baj[oa]\b|alarga/.test(t) ? "height" : /fondo|profund/.test(t) ? "depth" : undefined;
    if (dim) {
      const label = { width: "ancho", height: "alto", depth: "fondo" }[dim];
      const grow = /ensanch|agrand|alarga|aumenta|\bmas (ancho|alto|profundo|fondo|hondo)/.test(t);
      const shrink = /angost|estrech|reduce|achica|disminuy|\bmas (angosto|estrecho|bajo|corto)|menos (ancho|alto|fondo|profundo)/.test(t);
      const value = grow ? p[dim] + L : shrink ? p[dim] - L : L;
      updateItem(world, item.id, { params: { [dim]: value } });
      return done(`${item.name}: ${label} ${value} mm${grow || shrink ? ` (antes ${grow ? value - L : value + L})` : ""}.`);
    }
  }
  return unknown('En un mueble puedes: "ensancha 10 cm", "alto 1800", "muévelo 30 cm a la derecha", "pégalo a la izquierda", "agrega una repisa", "2 puertas", "súbelo 10 cm", "sin tornillos a la vista", "quítalo".');
}

function openingCommand(world: World, sel: Extract<Selection, { kind: "opening" }>, t: string): CommandResult {
  const room = getRoom(world, sel.roomId);
  const o = room.openings.find((x) => x.id === sel.openingId);
  if (!o) return fail(`No existe la abertura "${sel.openingId}".`);
  const len = wallLength(room, o.wall);
  const L = firstLength(t);
  const what = o.type === "window" ? "Ventana" : o.type === "door" ? "Puerta" : "Paso";
  const done = (message: string): CommandResult => ({ ok: true, understood: true, select: sel, message });

  if (DELETE.test(t)) { removeOpening(world, room.id, o.id); return { ok: true, understood: true, select: { kind: "wall", roomId: room.id, wall: o.wall }, message: `${what} quitada del ${WALL_NAMES[o.wall]}.` }; }
  const sill = lengthAfter(t, "antepecho|alfeizar");
  if (sill !== undefined) { updateOpening(world, room.id, o.id, { sill }); return done(`${what}: antepecho ${sill} mm.`); }
  const dims = parseDims(t);
  if (dims) { updateOpening(world, room.id, o.id, { width: dims[0], height: dims[1] }); return done(`${what}: ${dims[0]} x ${dims[1]} mm.`); }
  const anchor = parseAnchor(t);
  if (anchor) { const offset = offsetFor(anchor, len, o.width); updateOpening(world, room.id, o.id, { offset }); return done(`${what}: ${describeAnchor(anchor, offset)}.`); }
  if (L !== undefined && /muev|corre|desplaza/.test(t) && /derecha|izquierda/.test(t)) {
    const offset = o.offset + (/derecha/.test(t) ? L : -L);
    updateOpening(world, room.id, o.id, { offset });
    return done(`${what}: a ${offset} mm de la izquierda.`);
  }
  if (L !== undefined && /ancho|ensanch|angost/.test(t)) {
    const width = /ensanch|\bmas ancha?/.test(t) ? o.width + L : /angost|\bmas angosta?/.test(t) ? o.width - L : L;
    updateOpening(world, room.id, o.id, { width });
    return done(`${what}: ancho ${width} mm.`);
  }
  if (L !== undefined && /alto|altura/.test(t)) { updateOpening(world, room.id, o.id, { height: L }); return done(`${what}: alto ${L} mm.`); }
  return unknown('En una puerta o ventana puedes: "a 1,5 m de la derecha", "muévela 20 cm a la izquierda", "90 x 210", "ancho 90", "antepecho 110", "céntrala", "quítala".');
}

function roomCommand(world: World, sel: Extract<Selection, { kind: "room" }>, t: string): CommandResult {
  const room = getRoom(world, sel.roomId);
  const done = (message: string): CommandResult => ({ ok: true, understood: true, select: sel, message });
  const dims = parseDims(t);

  // Piso: "piso de porcelanato 60 x 60", "cerámica 45 x 45 trabada", "junta 2", "quita el piso"
  if (/\b(piso|enchape|baldosa|baldosas|ceramica|porcelanato|junta|trabad[oa]|traba)\b/.test(t)) {
    if (DELETE.test(t)) { room.floor = undefined; return done(`${room.name}: sin piso.`); }
    const jointMatch = t.match(new RegExp(`junta(?: de)? ${NUM} ?(mm|cm)?`));
    const patch: Partial<FloorSpec> = {};
    if (/porcelanato/.test(t)) patch.material = "porcelain"; else if (/ceramica/.test(t)) patch.material = "ceramic";
    if (dims) { patch.tileWidth = dims[0]; patch.tileLength = dims[1]; }
    if (jointMatch) patch.joint = jointMatch[2] === "cm" ? Math.round(Number(jointMatch[1]) * 10) : Math.round(Number(jointMatch[1]));
    if (/trabad[oa]|traba\b|ladrillo|intercalad[oa]/.test(t)) { patch.pattern = "brick"; patch.brickOffset = /tercio|1\/3/.test(t) ? 1 / 3 : 0.5; }
    if (/\brect[oa]\b|en linea|alinead[oa]/.test(t)) patch.pattern = "straight";
    if (/esquina/.test(t)) patch.start = "corner"; else if (/centrad[oa]|al centro|desde el centro/.test(t)) patch.start = "center";
    if (!room.floor && !dims) return fail('Dime el tamaño de la pieza: "piso de porcelanato 60 x 60".');
    const spec = room.floor ? { ...room.floor, ...patch } : defaultFloorSpec(patch);
    const plan = planFloor(room, spec);
    room.floor = spec;
    return done(`${room.name}: piso de ${spec.material === "porcelain" ? "porcelanato" : "cerámica"} ${spec.tileWidth} x ${spec.tileLength} mm, junta ${spec.joint} mm, ${spec.pattern === "brick" ? "trabado" : "recto"}. Necesitas ${plan.tilesToBuy} piezas (${String(Number((plan.tilesToBuy * spec.tileWidth * spec.tileLength / 1e6).toFixed(1))).replace(".", ",")} m², reserva del ${plan.reservePct} % incluida), ${plan.adhesive.bags25} saco(s) de pega ${plan.adhesive.type} y ${plan.grout.bags2} bolsa(s) de boquilla.`);
  }

  if (dims && !/puerta|ventana/.test(t)) {
    updateRoom(world, room.id, { width: dims[0], depth: dims[1], ...(dims[2] ? { height: dims[2] } : {}) });
    return done(`${room.name}: ${room.width} x ${room.depth} x ${room.height} mm.`);
  }
  const height = lengthAfter(t, "alto|altura|techo");
  if (height !== undefined) { updateRoom(world, room.id, { height }); return done(`${room.name}: altura ${height} mm.`); }
  const width = lengthAfter(t, "ancho");
  if (width !== undefined) { updateRoom(world, room.id, { width }); return done(`${room.name}: ancho ${width} mm.`); }
  const depth = lengthAfter(t, "largo|fondo|profundidad");
  if (depth !== undefined) { updateRoom(world, room.id, { depth }); return done(`${room.name}: fondo ${depth} mm.`); }
  const thickness = lengthAfter(t, "grosor|espesor");
  if (thickness !== undefined) { updateRoom(world, room.id, { wallThickness: { north: thickness, east: thickness, south: thickness, west: thickness } }); return done(`${room.name}: muros de ${thickness} mm.`); }
  return unknown('En una habitación puedes: "piso de porcelanato 60 x 60", "piso de cerámica 45 x 45 trabado", "junta 2", "3,6 x 3,2 m", "alto 2,6 m", "grosor 15 cm". Para puertas, ventanas y muebles, selecciona el muro.');
}

function worldCommand(world: World, t: string): CommandResult {
  const dims = parseDims(t);
  if (!dims) return unknown('Sin nada seleccionado puedes crear una habitación: "cocina de 2,8 x 2,4 m" o "habitación Estudio de 3 x 3 x 2,6 m". Para lo demás, haz clic en un muro, un mueble o una abertura.');
  const before = t.slice(0, t.search(/\d/)).replace(/\b(agrega|anade|crea|nuev[ao]|pon|un|una|habitacion|cuarto|pieza|recinto|espacio|llamad[ao]|de|del|la|el)\b/g, " ").replace(/\s+/g, " ").trim();
  const name = before ? before.charAt(0).toUpperCase() + before.slice(1) : `Habitación ${world.rooms.length + 1}`;
  // La nueva habitación se ubica a la derecha de las existentes, dejando el grosor de ambos muros.
  const right = world.rooms.reduce((x, r) => Math.max(x, r.origin[0] + r.width + r.wallThickness.east), -150);
  const room = addRoom(world, { name, width: dims[0], depth: dims[1], height: dims[2] ?? 2400, origin: [world.rooms.length ? right + 150 : 0, 0] });
  return { ok: true, understood: true, select: { kind: "room", roomId: room.id }, message: `${room.name}: ${room.width} x ${room.depth} x ${room.height} mm.` };
}
