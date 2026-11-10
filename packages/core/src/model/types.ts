import type { Millimeters } from "./units.js";

/** Tipos de material que Handy conoce. */
export type MaterialKind = "board" | "edgeband" | "hardware" | "other";

export interface Material {
  id: string;
  name: string;
  kind: MaterialKind;
  /** Espesor en mm (tableros y tapacantos). */
  thickness?: Millimeters;
  /** Medida del formato comercial (tableros). */
  sheet?: { width: Millimeters; height: Millimeters };
  /** Color o decorado comercial, p.ej. "Blanco", "Roble Americano". */
  finish?: string;
  /** Referencia a textura (ruta o URL) para el visor 3D. */
  texture?: string;
}

/** Qué cantos llevan tapacanto. Se nombran mirando la cara de la pieza. */
export interface EdgeBanding {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export type Grain = "along-height" | "along-width" | "none";

/** Posición y orientación de una pieza en el mueble (origen: esquina inferior-izquierda-trasera). */
export interface Placement {
  x: Millimeters;
  y: Millimeters;
  z: Millimeters;
  /** Eje perpendicular a la cara de la pieza: "x" costado, "y" piso/techo, "z" fondo/puerta. */
  normal: "x" | "y" | "z";
}

export interface Panel {
  id: string;
  name: string;
  /** Largo (dirección de la veta si grain = along-height). */
  height: Millimeters;
  width: Millimeters;
  thickness: Millimeters;
  materialId: string;
  qty: number;
  grain: Grain;
  edgeBanding: EdgeBanding;
  edgeMaterialId?: string;
  placement?: Placement;
  /** Presente solo en piezas móviles (puertas, cajones, frentes abatibles). */
  motion?: MotionSpec;
  /** Cuando qty > 1: posición (y movimiento) de cada unidad. Si falta, todas comparten `placement`. */
  instances?: PanelInstance[];
  notes?: string;
}

export interface HardwareItem {
  id: string;
  name: string;
  qty: number;
  /** Categoría usada para buscar precios: "hinge", "cam-lock", "confirmat", "shelf-pin", ... */
  category: string;
  spec?: Record<string, string | number>;
}

/** Sistemas de unión soportados. Ver docs/modulos/muebles.md */
export type Joinery = "confirmat" | "minifix" | "dowel" | "pocket-screw";

export interface FurnitureModel {
  id: string;
  name: string;
  /** Medidas exteriores. */
  dims: { width: Millimeters; height: Millimeters; depth: Millimeters };
  joinery: Joinery;
  panels: Panel[];
  hardware: HardwareItem[];
  materials: Material[];
  meta?: Record<string, unknown>;
}

/** Cómo se mueve una pieza según su herraje. Lo anima el visor y lo usa la detección de colisiones. */
export type MotionSpec =
  | { kind: "hinge"; axis: "left" | "right" | "top" | "bottom"; maxAngleDeg: number; softClose?: boolean }
  | { kind: "slide"; direction: "front" | "left" | "right"; travel: Millimeters; loadKg?: number; softClose?: boolean }
  | { kind: "lift"; maxAngleDeg: number; loadKg?: number };

export interface PanelInstance {
  placement: Placement;
  motion?: MotionSpec;
}
