/**
 * Handy trabaja SIEMPRE en milímetros enteros internamente.
 * Las conversiones solo ocurren en la capa de presentación.
 */
export type Millimeters = number;

export const mm = (n: number): Millimeters => Math.round(n);
export const cmToMm = (cm: number): Millimeters => mm(cm * 10);
export const mToMm = (m: number): Millimeters => mm(m * 1000);
export const inchToMm = (inch: number): Millimeters => mm(inch * 25.4);
export const mmToM2 = (w: Millimeters, h: Millimeters): number => (w * h) / 1_000_000;
export const mmToMeters = (v: Millimeters): number => v / 1000;
