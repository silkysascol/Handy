import type { FurnitureModel, Joinery, Panel } from "./model/index.js";
import { panelBox, panelInstances, type AABB } from "./collision.js";

/**
 * Uniones y perforaciones calculadas desde la geometría: dónde toca el canto de una pieza la cara de otra,
 * cuántos herrajes lleva esa unión y en qué punto exacto va cada uno. De aquí salen la cantidad de herrajes,
 * el plano de perforación de cada pieza (para la tienda o para una plantilla) y los puntos que el armado señala.
 */
type Vec3 = [number, number, number];

export function hingesPerDoor(doorHeight: number): number {
  if (doorHeight <= 900) return 2;
  if (doorHeight <= 1600) return 3;
  if (doorHeight <= 2000) return 4;
  return 5;
}

/** Herrajes de una unión según su largo. */
export function fastenersForLength(length: number): number {
  if (length < 120) return 1;
  if (length <= 350) return 2;
  if (length <= 600) return 3;
  return 4;
}

export type FasteningKind = "structural" | "shelf-pin" | "hinge" | "slide" | "rod";

export interface Fastening {
  kind: FasteningKind;
  /** Pieza que llega (de canto, o la puerta, la repisa, el cajón, la barra). */
  part: string;
  partInstance: number;
  /** Pieza que la recibe en su cara. */
  into: string;
  intoInstance: number;
  /** Puntos de fijación, en coordenadas del mueble (mm). */
  points: Vec3[];
  /** Dónde quedan esos puntos sobre la pieza que recibe, dicho para quien mide con metro. */
  where: string;
}

export interface DrillMark {
  partId: string;
  instance: number;
  /** Posición sobre la cara de la pieza, medida desde su esquina de origen (ver `axes`). */
  u: number;
  v: number;
  /** true = la perforación va en el canto (en el borde del dibujo), no en la cara. */
  edge: boolean;
  /** En cuál de las dos caras va, cuando no es en el canto. */
  face?: string;
  diameter: number;
  depth?: number;
  /** Qué va ahí: "perno", "excéntrica", "tarugo", "confirmat", "soporte de repisa", "cazoleta de bisagra"... */
  what: string;
}

export interface JointSet { fastenings: Fastening[]; marks: DrillMark[] }

const STRUCTURAL = new Set(["side-left", "side-right", "top", "bottom", "plinth", "divider", "shelf-fixed", "shelf-top"]);
const AXIS = { x: 0, y: 1, z: 2 } as const;
/** Desde dónde se mide en cada eje, como se le dice a quien perfora. */
export const AXIS_LABEL = ["desde el canto izquierdo", "desde abajo", "desde el canto trasero"] as const;

interface Inst { id: string; i: number; panel: Panel; box: AABB; n: 0 | 1 | 2 }

function instancesOf(panels: Panel[]): Inst[] {
  const out: Inst[] = [];
  for (const p of panels) panelInstances(p).forEach((u, i) => { const box = panelBox(p, u.placement); if (box) out.push({ id: p.id, i, panel: p, box, n: AXIS[u.placement.normal] }); });
  return out;
}

/** Ejes del plano de una pieza: [u, v]. Costados: fondo y alto. Horizontales: ancho y fondo. Frentes: ancho y alto. */
export function faceAxes(n: 0 | 1 | 2): [0 | 1 | 2, 0 | 1 | 2] {
  return n === 0 ? [2, 1] : n === 1 ? [0, 2] : [0, 1];
}

interface RawJoint { a: Inst; b: Inst; k: 0 | 1 | 2; l: 0 | 1 | 2; side: "min" | "max"; points: Vec3[] }

/** Uniones estructurales: el canto de `a` contra la cara de `b`. */
function structuralJoints(all: Inst[]): RawJoint[] {
  const s = all.filter((x) => STRUCTURAL.has(x.id));
  const joints: RawJoint[] = [];
  for (const a of s) for (const b of s) {
    if (a === b || a.n === b.n) continue;
    // El zócalo solo se une a los costados; contra el piso va apoyado.
    if (a.id === "plinth" && b.id !== "side-left" && b.id !== "side-right") continue;
    const k = b.n;
    const side = Math.abs(a.box.min[k] - b.box.max[k]) <= 1 ? "min" : Math.abs(a.box.max[k] - b.box.min[k]) <= 1 ? "max" : null;
    if (!side) continue;
    const ta = a.n, l = (3 - k - ta) as 0 | 1 | 2;
    const over = (ax: number) => Math.min(a.box.max[ax], b.box.max[ax]) - Math.max(a.box.min[ax], b.box.min[ax]);
    if (over(ta) < a.panel.thickness - 1) continue;
    const s0 = Math.max(a.box.min[l], b.box.min[l]), s1 = Math.min(a.box.max[l], b.box.max[l]), L = s1 - s0;
    if (L < 30) continue;
    const n = fastenersForLength(L), inset = Math.min(50, L / 4);
    const points: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const p: Vec3 = [0, 0, 0];
      p[k] = side === "min" ? a.box.min[k] : a.box.max[k];
      p[ta] = (a.box.min[ta] + a.box.max[ta]) / 2;
      p[l] = Math.round(n === 1 ? (s0 + s1) / 2 : s0 + inset + ((L - 2 * inset) * i) / (n - 1));
      points.push(p);
    }
    joints.push({ a, b, k, l, side, points });
  }
  return joints;
}

/** Cuántos herrajes estructurales lleva el mueble: lo usa el generador para la lista de herrajes. */
export function countStructuralFasteners(panels: Panel[]): number {
  return structuralJoints(instancesOf(panels)).reduce((n, j) => n + j.points.length, 0);
}

const FACE_NAME = [["cara izquierda", "cara derecha"], ["cara de abajo", "cara de arriba"], ["cara trasera", "cara frontal"]] as const;
/** Nombre de la cara de `x` en la que cae el punto `p`. */
const faceAt = (x: Inst, p: Vec3): string => FACE_NAME[x.n][Math.abs(p[x.n] - x.box.min[x.n]) <= Math.abs(p[x.n] - x.box.max[x.n]) ? 0 : 1];

/** "línea a 89 mm desde abajo; a 50 · 300 · 550 mm desde el canto trasero". */
function describe(x: Inst, points: Vec3[]): string {
  const [au, av] = faceAxes(x.n);
  const us = [...new Set(points.map((p) => Math.round(p[au] - x.box.min[au])))].sort((a, b) => a - b);
  const vs = [...new Set(points.map((p) => Math.round(p[av] - x.box.min[av])))].sort((a, b) => a - b);
  if (us.length === 1 && vs.length === 1) return `a ${us[0]} mm ${AXIS_LABEL[au]} y ${vs[0]} mm ${AXIS_LABEL[av]}`;
  return vs.length <= us.length
    ? `sobre ${vs.length === 1 ? "la línea" : "las líneas"} a ${vs.join(" · ")} mm ${AXIS_LABEL[av]}, a ${us.join(" · ")} mm ${AXIS_LABEL[au]}`
    : `sobre ${us.length === 1 ? "la línea" : "las líneas"} a ${us.join(" · ")} mm ${AXIS_LABEL[au]}, a ${vs.join(" · ")} mm ${AXIS_LABEL[av]}`;
}

const onFace = (x: Inst, p: Vec3): { u: number; v: number } => { const [au, av] = faceAxes(x.n); return { u: Math.round(p[au] - x.box.min[au]), v: Math.round(p[av] - x.box.min[av]) }; };

/** Todas las fijaciones del mueble y las perforaciones de cada pieza. */
export function computeJoints(model: FurnitureModel): JointSet {
  const all = instancesOf(model.panels);
  const fastenings: Fastening[] = [];
  const marks: DrillMark[] = [];
  const mark = (x: Inst, p: Vec3, m: Omit<DrillMark, "partId" | "instance" | "u" | "v" | "face">, face?: string) => marks.push({ partId: x.id, instance: x.i, ...onFace(x, p), ...m, ...(m.edge ? {} : { face: face ?? faceAt(x, p) }) });
  /** Las excéntricas van en la cara que menos se ve. */
  const hidden = (a: Inst): string => FACE_NAME[a.n][a.n === 1 ? (a.id === "bottom" && a.box.min[1] <= 0 ? 1 : 0) : a.n === 2 ? 0 : 1];
  const joinery: Joinery = model.joinery;

  for (const j of structuralJoints(all)) {
    fastenings.push({ kind: "structural", part: j.a.id, partInstance: j.a.i, into: j.b.id, intoInstance: j.b.i, points: j.points, where: `en la ${faceAt(j.b, j.points[0])}, ${describe(j.b, j.points)}` });
    const mid = (j.points[0][j.l] + j.points[j.points.length - 1][j.l]) / 2;
    for (const p of j.points) {
      // Punto equivalente dentro de la cara de `a`, a cierta distancia del canto que toca.
      const inA = (dist: number): Vec3 => { const q: Vec3 = [...p]; q[j.k] += j.side === "min" ? dist : -dist; return q; };
      const shifted = (q: Vec3, d: number): Vec3 => { const r: Vec3 = [...q]; r[j.l] += d; return r; };
      const toward = p[j.l] <= mid ? 32 : -32;
      if (joinery === "minifix") {
        mark(j.b, p, { edge: false, diameter: 5, depth: 12, what: "perno minifix" });
        mark(j.a, p, { edge: true, diameter: 8, depth: 34, what: "paso del perno" });
        mark(j.a, inA(34), { edge: false, diameter: 15, depth: 13, what: "excéntrica" }, hidden(j.a));
        // Un tarugo junto a cada excéntrica impide que la pieza gire.
        mark(j.b, shifted(p, toward), { edge: false, diameter: 8, depth: 12, what: "tarugo" });
        mark(j.a, shifted(p, toward), { edge: true, diameter: 8, depth: 20, what: "tarugo" });
      } else if (joinery === "confirmat") {
        mark(j.b, p, { edge: false, diameter: 7, what: "confirmat (pasante, desde afuera)" });
        mark(j.a, p, { edge: true, diameter: 5, depth: 40, what: "guía del confirmat" });
      } else if (joinery === "dowel") {
        for (const d of [-16, 16]) {
          mark(j.b, shifted(p, d), { edge: false, diameter: 8, depth: 12, what: "tarugo" });
          mark(j.a, shifted(p, d), { edge: true, diameter: 8, depth: 24, what: "tarugo" });
        }
      } else {
        mark(j.a, inA(20), { edge: false, diameter: 9, what: "tornillo inclinado (pocket)" }, hidden(j.a));
      }
    }
  }

  const uprights = all.filter((x) => x.n === 0 && STRUCTURAL.has(x.id));
  const nearest = (x: number, candidates: Inst[] = uprights) => candidates.slice().sort((p, q) => Math.abs((p.box.min[0] + p.box.max[0]) / 2 - x) - Math.abs((q.box.min[0] + q.box.max[0]) / 2 - x))[0];
  /** Punto sobre la cara del parante que mira hacia `fromX`. */
  const onUpright = (up: Inst, fromX: number, y: number, z: number): Vec3 => [fromX < (up.box.min[0] + up.box.max[0]) / 2 ? up.box.min[0] : up.box.max[0], y, z];

  for (const sh of all.filter((x) => x.id === "shelf")) {
    const left = nearest(sh.box.min[0], uprights.filter((u) => u.box.max[0] <= sh.box.min[0] + 3));
    const right = nearest(sh.box.max[0], uprights.filter((u) => u.box.min[0] >= sh.box.max[0] - 3));
    for (const [up, x] of [[left, sh.box.min[0]], [right, sh.box.max[0]]] as [Inst | undefined, number][]) {
      if (!up) continue;
      const pts: Vec3[] = [sh.box.min[2] + 50, sh.box.max[2] - 50].map((z) => onUpright(up, x, sh.box.min[1] - 3, Math.round(z)));
      fastenings.push({ kind: "shelf-pin", part: sh.id, partInstance: sh.i, into: up.id, intoInstance: up.i, points: pts, where: `en la ${faceAt(up, pts[0])}, ${describe(up, pts)}` });
      for (const p of pts) mark(up, p, { edge: false, diameter: 5, depth: 10, what: "soporte de repisa" });
    }
  }

  for (const door of all.filter((x) => x.id === "door")) {
    const motion = panelInstances(door.panel)[door.i]?.motion;
    if (motion?.kind !== "hinge" || (motion.axis !== "left" && motion.axis !== "right")) continue;
    const leftHung = motion.axis === "left";
    const hx = leftHung ? door.box.min[0] : door.box.max[0];
    const up = nearest(hx);
    if (!up) continue;
    const h = door.box.max[1] - door.box.min[1], n = hingesPerDoor(h);
    const pts: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const y = Math.round(door.box.min[1] + 100 + ((h - 200) * i) / (n - 1));
      pts.push([hx, y, door.box.min[2]]);
      mark(door, [hx + (leftHung ? 22.5 : -22.5), y, door.box.min[2]], { edge: false, diameter: 35, depth: 13, what: "cazoleta de bisagra" });
      mark(up, onUpright(up, hx + (leftHung ? 40 : -40), y, up.box.max[2] - 37), { edge: false, diameter: 3, depth: 10, what: "base de bisagra" });
    }
    fastenings.push({ kind: "hinge", part: door.id, partInstance: door.i, into: up.id, intoInstance: up.i, points: pts, where: `a 37 mm del canto del frente, a ${pts.map((p) => Math.round(p[1] - up.box.min[1])).join(" · ")} mm desde abajo` });
  }

  for (const ds of all.filter((x) => x.id === "drawer-side")) {
    const cx = (ds.box.min[0] + ds.box.max[0]) / 2;
    const up = nearest(cx);
    if (!up) continue;
    const y = Math.round((ds.box.min[1] + ds.box.max[1]) / 2);
    const pts: Vec3[] = [ds.box.max[2] - 37, ds.box.min[2] + 37].map((z) => onUpright(up, cx, y, Math.round(Math.min(z, up.box.max[2] - 37))));
    fastenings.push({ kind: "slide", part: ds.id, partInstance: ds.i, into: up.id, intoInstance: up.i, points: pts, where: `en la ${faceAt(up, pts[0])}, eje a ${Math.round(y - up.box.min[1])} mm desde abajo` });
    for (const p of pts) mark(up, p, { edge: false, diameter: 3, depth: 10, what: "corredera" });
  }

  (model.fixtures ?? []).filter((f) => f.kind === "rod").forEach((f, i) => {
    const y = Math.round((f.box.min[1] + f.box.max[1]) / 2), z = Math.round((f.box.min[2] + f.box.max[2]) / 2);
    for (const x of [f.box.min[0], f.box.max[0]]) {
      const up = nearest(x);
      if (!up) continue;
      const p = onUpright(up, (f.box.min[0] + f.box.max[0]) / 2, y, z);
      fastenings.push({ kind: "rod", part: "rod", partInstance: i, into: up.id, intoInstance: up.i, points: [p], where: `en la ${faceAt(up, p)}, ${describe(up, [p])}` });
      mark(up, p, { edge: false, diameter: 3, depth: 10, what: "soporte de la barra" });
    }
  });

  return { fastenings, marks };
}

// ---------- Plano de perforación por pieza ----------

export interface DrillSheet {
  partId: string;
  instance: number;
  name: string;
  /** Medidas de la cara dibujada y desde dónde se mide cada eje. */
  width: number;
  height: number;
  uLabel: string;
  vLabel: string;
  marks: DrillMark[];
  /** Las mismas perforaciones dichas en texto, agrupadas por línea. */
  lines: string[];
}

/** Un plano por pieza con perforaciones. Piezas iguales con las mismas perforaciones se juntan ("× 2"). */
export function drillSheets(model: FurnitureModel, joints: JointSet = computeJoints(model)): (DrillSheet & { copies: number })[] {
  const out: (DrillSheet & { copies: number; key: string })[] = [];
  for (const x of instancesOf(model.panels)) {
    const mine = joints.marks.filter((m) => m.partId === x.id && m.instance === x.i);
    if (!mine.length) continue;
    const [au, av] = faceAxes(x.n);
    const width = x.box.max[au] - x.box.min[au], height = x.box.max[av] - x.box.min[av];
    const lines: string[] = [];
    const kinds = [...new Set(mine.map((m) => `${m.what}|${m.edge ? 1 : 0}|${m.diameter}|${m.depth ?? ""}|${m.face ?? ""}`))];
    for (const kind of kinds) {
      const [what, edge, diameter, depth, face] = kind.split("|");
      const ms = mine.filter((m) => m.what === what && String(m.edge ? 1 : 0) === edge && String(m.diameter) === diameter && (m.face ?? "") === face);
      // Se agrupan por la coordenada que menos cambia: así cada renglón es una línea de taladros.
      const byV = new Set(ms.map((m) => m.v)).size <= new Set(ms.map((m) => m.u)).size;
      const groups = new Map<number, number[]>();
      for (const m of ms) { const key = byV ? m.v : m.u; groups.set(key, [...(groups.get(key) ?? []), byV ? m.u : m.v]); }
      const spec = `Ø${diameter} mm${depth ? `, ${depth} mm de fondo` : ", pasante"}`;
      for (const [line, at] of [...groups].sort((p, q) => p[0] - q[0])) {
        const where = edge === "1" ? `en el canto` : `en la ${face}`;
        const uniq = [...new Set(at)].sort((p, q) => p - q);
        lines.push(`${cap(what)} (${spec}), ${where}: línea a ${line} mm ${byV ? AXIS_LABEL[av] : AXIS_LABEL[au]}; taladros a ${uniq.join(" · ")} mm ${byV ? AXIS_LABEL[au] : AXIS_LABEL[av]}.`);
      }
    }
    const key = `${x.id}|${width}|${height}|${JSON.stringify(mine.map((m) => [m.u, m.v, m.edge, m.diameter, m.what]).sort())}`;
    const same = out.find((o) => o.key === key);
    if (same) { same.copies++; continue; }
    const total = panelInstances(x.panel).length;
    out.push({ key, copies: 1, partId: x.id, instance: x.i, name: total > 1 ? `${x.panel.name} ${x.i + 1}/${total}` : x.panel.name, width, height, uLabel: AXIS_LABEL[au], vLabel: AXIS_LABEL[av], marks: mine, lines });
  }
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Dibujo de la cara de una pieza con sus perforaciones: círculos en la cara, triángulos en el canto. */
export function drillSheetSvg(sheet: DrillSheet): string {
  // El lienzo sigue la proporción de la pieza: un costado alto se dibuja alto, para que las marcas no se amontonen.
  const portrait = sheet.height > sheet.width * 1.3;
  const W = portrait ? 340 : 600, H = portrait ? 600 : 340, pad = 38;
  const k = Math.min((W - 2 * pad) / sheet.width, (H - 2 * pad) / sheet.height);
  const w = sheet.width * k, h = sheet.height * k, ox = (W - w) / 2, oy = (H - h) / 2;
  // El origen (0,0) se dibuja abajo a la izquierda, como se mide con el metro.
  const X = (u: number) => ox + u * k, Y = (v: number) => oy + h - v * k;
  const body = sheet.marks.map((m) => {
    const x = X(m.u), y = Y(m.v), r = Math.max(2.2, Math.min(7, (m.diameter * k) / 2 + 1.5));
    if (m.edge) return `<path d="M${x.toFixed(1)} ${y.toFixed(1)}m-4 0l4 -6l4 6z" fill="#111" transform="rotate(${edgeAngle(m, sheet)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${m.diameter >= 15 ? "#fff" : "#111"}" stroke="#111" stroke-width="1.5"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#111"><rect width="100%" height="100%" fill="#fff"/><rect x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#f6f6f4" stroke="#111" stroke-width="1.5"/>${body}<circle cx="${ox.toFixed(1)}" cy="${(oy + h).toFixed(1)}" r="3" fill="none" stroke="#111"/><text x="${(ox + w / 2).toFixed(1)}" y="${(oy + h + 16).toFixed(1)}" text-anchor="middle">${sheet.width} mm · ${sheet.uLabel} →</text><text transform="translate(${(ox - 8).toFixed(1)} ${(oy + h / 2).toFixed(1)}) rotate(-90)" text-anchor="middle">${sheet.height} mm · ${sheet.vLabel} →</text></svg>`;
}

/** Hacia dónde apunta la marca de canto: hacia afuera del borde más cercano. */
function edgeAngle(m: DrillMark, s: DrillSheet): number {
  const d = [m.v, s.width - m.u, s.height - m.v, m.u]; // abajo, derecha, arriba, izquierda
  return [180, 90, 0, 270][d.indexOf(Math.min(...d))];
}
