import type { FurnitureModel, Millimeters, MotionSpec, Panel } from "./model/index.js";

export interface AABB {
  min: [Millimeters, Millimeters, Millimeters];
  max: [Millimeters, Millimeters, Millimeters];
}

/** Algo que puede estorbar al movimiento: un muro, un electrodoméstico con su puerta abierta, otro mueble. */
export interface Obstacle {
  id: string;
  name: string;
  box: AABB;
}

export interface Collision {
  panelId: string;
  againstId: string;
  againstName: string;
  /** Fracción del recorrido (0 = cerrado, 1 = abierto del todo) donde empieza el choque. */
  at: number;
  /** Ángulo o recorrido en el que empieza el choque, según el tipo de movimiento. */
  angleDeg?: number;
  travel?: Millimeters;
  message: string;
}

type Vec3 = [number, number, number];

/** Caja de una pieza en reposo a partir de su `placement` y su normal. */
export function panelBox(p: Panel): AABB | undefined {
  if (!p.placement) return undefined;
  const { x, y, z, normal } = p.placement;
  const size: Vec3 =
    normal === "x" ? [p.thickness, p.height, p.width] :
    normal === "y" ? [p.height, p.thickness, p.width] :
    [p.width, p.height, p.thickness];
  return { min: [x, y, z], max: [x + size[0], y + size[1], z + size[2]] };
}

function corners(b: AABB): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}

function aabbOf(points: Vec3[]): AABB {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
  return { min, max };
}

/** Solapamiento estricto: tocarse por una cara no cuenta como choque. */
export function overlaps(a: AABB, b: AABB, tolerance = 0.5): boolean {
  for (let i = 0; i < 3; i++) if (a.max[i] - tolerance <= b.min[i] || b.max[i] - tolerance <= a.min[i]) return false;
  return true;
}

/** Caja envolvente de una pieza en una fracción `t` de su movimiento. */
export function boxAt(p: Panel, rest: AABB, motion: MotionSpec, t: number): AABB {
  if (motion.kind === "slide") {
    const d = motion.travel * t;
    const shift: Vec3 = motion.direction === "front" ? [0, 0, d] : motion.direction === "right" ? [d, 0, 0] : [-d, 0, 0];
    return { min: [rest.min[0] + shift[0], rest.min[1] + shift[1], rest.min[2] + shift[2]], max: [rest.max[0] + shift[0], rest.max[1] + shift[1], rest.max[2] + shift[2]] };
  }
  const ang = (motion.maxAngleDeg * t * Math.PI) / 180;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  // Eje del giro en la cara exterior (frontal) de la pieza: así la puerta gira hacia +z sin
  // atravesar el costado, como ocurre con una bisagra cazoleta real.
  const pts = corners(rest).map(([x, y, z]): Vec3 => {
    if (motion.kind === "hinge" && (motion.axis === "left" || motion.axis === "right")) {
      const px = motion.axis === "left" ? rest.min[0] : rest.max[0];
      const pz = rest.max[2];
      const dx = x - px, dz = z - pz;
      const s = motion.axis === "left" ? 1 : -1;
      return [px + dx * cos - s * dz * sin, y, pz + s * dx * sin + dz * cos];
    }
    // Bisagra arriba/abajo o sistema abatible: giro sobre eje horizontal.
    const py = motion.kind === "hinge" && motion.axis === "bottom" ? rest.min[1] : rest.max[1];
    const pz = rest.max[2];
    const dy = y - py, dz = z - pz;
    const s = motion.kind === "hinge" && motion.axis === "bottom" ? -1 : 1;
    return [x, py + dy * cos + s * dz * sin, pz - s * dy * sin + dz * cos];
  });
  return aabbOf(pts);
}

/**
 * Recorre el movimiento de cada pieza móvil y reporta el primer instante en que su caja
 * choca con otra pieza del mueble o con un obstáculo externo. Los solapes que ya existen
 * en reposo (p.ej. un cajón dentro de su caja) se ignoran.
 */
export function checkMotionCollisions(model: FurnitureModel, obstacles: Obstacle[] = [], samples = 24): Collision[] {
  const out: Collision[] = [];
  const statics = model.panels.filter((p) => !p.motion).map((p) => ({ id: p.id, name: p.name, box: panelBox(p) })).filter((s): s is { id: string; name: string; box: AABB } => !!s.box);
  const targets = [...statics, ...obstacles];

  for (const p of model.panels) {
    const rest = panelBox(p);
    if (!p.motion || !rest) continue;
    const ignore = new Set(targets.filter((t) => overlaps(rest, t.box)).map((t) => t.id));
    const hit = new Set<string>();
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const box = boxAt(p, rest, p.motion, t);
      for (const target of targets) {
        if (ignore.has(target.id) || hit.has(target.id) || !overlaps(box, target.box)) continue;
        hit.add(target.id);
        const c: Collision = { panelId: p.id, againstId: target.id, againstName: target.name, at: t, message: "" };
        if (p.motion.kind === "slide") {
          c.travel = Math.round(p.motion.travel * t);
          c.message = `${p.name} choca con ${target.name} a los ${c.travel} mm de recorrido (de ${p.motion.travel}).`;
        } else {
          c.angleDeg = Math.round(p.motion.maxAngleDeg * t);
          c.message = `${p.name} choca con ${target.name} al abrir ${c.angleDeg}° (máximo ${p.motion.maxAngleDeg}°). Usa una bisagra de menor ángulo, un tope o separa el mueble.`;
        }
        out.push(c);
      }
    }
  }
  return out;
}
