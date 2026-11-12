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
    if (p.id === "shelf" || p.id === "shelf-top" || p.id === "shelf-fixed") {
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

  const params = (model.meta?.params ?? {}) as { hangingBar?: boolean };
  const rod = model.fixtures?.find((f) => f.kind === "rod");
  if (rod) {
    const span = rod.box.max[0] - rod.box.min[0];
    if (span > 1000) issues.push({ level: "warning", code: "rod-span", message: `Barra de colgar de ${span} mm: sobre 1000 mm se dobla con la ropa. Agrega un soporte central o una división.` });
    if (params.hangingBar && model.dims.depth < 550) issues.push({ level: "warning", code: "closet-shallow", message: `Fondo de ${model.dims.depth} mm: para colgar ropa de frente se necesitan 550 a 600 mm; con menos, los ganchos chocan con las puertas.` });
  }
  const front = model.panels.find((p) => p.id === "drawer-front");
  if (front && front.height > 900) {
    issues.push({ level: "warning", code: "drawer-wide", panelId: front.id, message: `Frente de cajón de ${front.height} mm: sobre 900 mm la corredera de 30 kg queda corta y el fondo se hunde. Divide el cuerpo o usa correderas de 45 kg.` });
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
