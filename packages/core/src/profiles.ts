import type { Millimeters } from "./model/index.js";

/** Perfil metálico comercial. Medidas en mm; peso en kg por metro; barra comercial de 6 m. */
export interface ProfileSpec {
  id: string;
  name: string;
  family: "square-tube" | "rect-tube" | "angle";
  /** Lado mayor y lado menor de la sección. */
  a: Millimeters;
  b: Millimeters;
  /** Espesor de pared. */
  t: number;
  kgPerM: number;
  stockLength: Millimeters;
  /** Luz máxima recomendada como travesaño horizontal con carga doméstica, antes de pedir un apoyo intermedio. */
  maxSpan: Millimeters;
}

/** Peso teórico de un tubo de acero: área de la sección por la densidad (7,85 g/cm³). */
const tubeKg = (a: number, b: number, t: number) => Number((((a * b - (a - 2 * t) * (b - 2 * t)) * 7.85) / 1000).toFixed(2));

const square = (a: number, t: number, maxSpan: number): ProfileSpec => ({ id: `tubo-${a}x${a}x${t}`, name: `Tubo cuadrado ${a} x ${a} x ${String(t).replace(".", ",")} mm`, family: "square-tube", a, b: a, t, kgPerM: tubeKg(a, a, t), stockLength: 6000, maxSpan });

export const PROFILES: ProfileSpec[] = [
  square(20, 1.2, 800),
  square(25, 1.5, 1000),
  square(30, 1.5, 1300),
  square(40, 1.5, 1800),
  square(50, 2, 2400),
];

export const DEFAULT_PROFILE = "tubo-40x40x1.5";

export function getProfile(id: string): ProfileSpec {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new Error(`No conozco el perfil "${id}". Disponibles: ${PROFILES.map((x) => x.id).join(", ")}.`);
  return p;
}

/** El perfil cuadrado cuyo lado se acerca más al pedido ("tubo de 40"). */
export function profileBySide(side: number): ProfileSpec {
  return [...PROFILES].sort((x, y) => Math.abs(x.a - side) - Math.abs(y.a - side))[0];
}
