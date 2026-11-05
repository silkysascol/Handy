import type { FurnitureModel, Millimeters, Panel } from "./model/index.js";
import { mmToM2 } from "./model/index.js";

export interface CutlistRow {
  name: string;
  qty: number;
  height: Millimeters;
  width: Millimeters;
  thickness: Millimeters;
  materialId: string;
  grain: Panel["grain"];
  /** Cantos a enchapar en notación L (largo) / A (ancho): p.ej. "1L" , "2L 1A". */
  edges: string;
  /** Metros lineales de tapacanto para esta fila (todas las unidades). */
  edgeBandMeters: number;
}

export interface MaterialSummary {
  materialId: string;
  thickness: Millimeters;
  /** Área neta de piezas, m². */
  areaM2: number;
  /** Tableros estimados considerando desperdicio. */
  sheetsEstimate: number;
}

export interface Cutlist {
  rows: CutlistRow[];
  materials: MaterialSummary[];
  edgeBandMeters: Record<string, number>;
  /** Factor de desperdicio usado (0.15 = 15 %). */
  wasteFactor: number;
}

function edgeNotation(p: Panel): string {
  const longs = Number(p.edgeBanding.left) + Number(p.edgeBanding.right);
  const shorts = Number(p.edgeBanding.top) + Number(p.edgeBanding.bottom);
  const parts: string[] = [];
  if (longs) parts.push(`${longs}L`);
  if (shorts) parts.push(`${shorts}A`);
  return parts.join(" ") || "-";
}

function edgeMeters(p: Panel): number {
  const perUnit =
    (Number(p.edgeBanding.left) + Number(p.edgeBanding.right)) * p.height +
    (Number(p.edgeBanding.top) + Number(p.edgeBanding.bottom)) * p.width;
  return (perUnit * p.qty) / 1000;
}

/** Genera la lista de corte y el resumen de materiales de un mueble. */
export function buildCutlist(model: FurnitureModel, wasteFactor = 0.15): Cutlist {
  const rows: CutlistRow[] = model.panels.map((p) => ({
    name: p.name,
    qty: p.qty,
    height: p.height,
    width: p.width,
    thickness: p.thickness,
    materialId: p.materialId,
    grain: p.grain,
    edges: edgeNotation(p),
    edgeBandMeters: Number(edgeMeters(p).toFixed(2)),
  }));

  const byMaterial = new Map<string, MaterialSummary>();
  for (const p of model.panels) {
    const key = p.materialId;
    const entry = byMaterial.get(key) ?? { materialId: key, thickness: p.thickness, areaM2: 0, sheetsEstimate: 0 };
    entry.areaM2 += mmToM2(p.height, p.width) * p.qty;
    byMaterial.set(key, entry);
  }
  for (const entry of byMaterial.values()) {
    const mat = model.materials.find((m) => m.id === entry.materialId);
    const sheetArea = mat?.sheet ? mmToM2(mat.sheet.width, mat.sheet.height) : 1830 * 2500 / 1e6;
    entry.areaM2 = Number(entry.areaM2.toFixed(3));
    entry.sheetsEstimate = Math.ceil((entry.areaM2 * (1 + wasteFactor)) / sheetArea);
  }

  const edgeBandMeters: Record<string, number> = {};
  for (const p of model.panels) {
    const m = edgeMeters(p);
    if (m > 0) {
      const key = p.edgeMaterialId ?? "edgeband";
      edgeBandMeters[key] = Number(((edgeBandMeters[key] ?? 0) + m).toFixed(2));
    }
  }

  return { rows, materials: [...byMaterial.values()], edgeBandMeters, wasteFactor };
}
