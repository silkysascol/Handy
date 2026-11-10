import type { FurnitureModel } from "./model/index.js";

export type IssueLevel = "error" | "warning" | "tip";

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  panelId?: string;
}

/** Luz máxima recomendada (mm) para repisas de melamina/aglomerado con carga media (libros). */
const SHELF_SPAN_LIMITS: Record<number, number> = { 15: 600, 16: 650, 18: 800, 25: 1000 };

/**
 * Revisa reglas de buena práctica: pandeo de repisas, puertas demasiado anchas,
 * profundidades poco habituales, uniones visibles, etc.
 */
export function validateFurniture(model: FurnitureModel): Issue[] {
  const issues: Issue[] = [];

  for (const p of model.panels) {
    // Techo y piso van fijos a los costados y al fondo; la regla de pandeo aplica a las repisas sueltas.
    if (p.id === "shelf") {
      const limit = SHELF_SPAN_LIMITS[p.thickness] ?? 800;
      if (p.height > limit) {
        issues.push({
          level: "warning",
          code: "shelf-sag",
          panelId: p.id,
          message: `${p.name}: luz de ${p.height} mm en tablero de ${p.thickness} mm; sobre ${limit} mm tiende a pandear. Agrega un divisor vertical, usa 25 mm o un refuerzo frontal.`,
        });
      }
    }
    if (p.id === "door") {
      if (p.width > 600) {
        issues.push({
          level: "warning",
          code: "door-too-wide",
          panelId: p.id,
          message: `Puerta de ${p.width} mm: sobre 600 mm las bisagras cazoleta sufren y la puerta invade mucho al abrir. Considera 2 puertas.`,
        });
      }
      if (p.height > 2100) {
        issues.push({
          level: "tip",
          code: "door-tall",
          panelId: p.id,
          message: `Puerta de ${p.height} mm: usa 5 bisagras y considera dividir en 2 puertas (superior/inferior).`,
        });
      }
    }
  }

  if (model.dims.depth > 650) {
    issues.push({
      level: "tip",
      code: "deep-cabinet",
      message: `Profundidad ${model.dims.depth} mm: lo habitual es 300 a 600 mm. Profundidades mayores desperdician tablero y dificultan el acceso.`,
    });
  }

  if (model.joinery === "confirmat") {
    issues.push({
      level: "tip",
      code: "visible-fasteners",
      message:
        "Confirmat deja cabezas visibles en los costados exteriores. Para un acabado sin tornillos visibles usa minifix (excéntrica + espiga) o tarugos encolados.",
    });
  }

  return issues;
}
