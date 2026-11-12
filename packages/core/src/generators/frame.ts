import type { Bar, FurnitureModel, HardwareItem, Material, Millimeters, Panel } from "../model/index.js";
import { DEFAULT_PROFILE, getProfile } from "../profiles.js";

export interface FrameOptions {
  /** Mesa o base (4 patas y marco superior) o estantería (4 parales y un marco por nivel). */
  type: "table" | "shelving";
  profileId?: string;
  /** Niveles de la estantería, contando el de arriba. Por defecto 4. */
  levels?: number;
  /** Cubierta o entrepaños de tablero sobre el marco. Por defecto sí. */
  top?: boolean;
  /** Soldado, o atornillado con conectores para quien no suelda. */
  joint?: "weld" | "bolt";
}

export interface FrameParams extends FrameOptions {
  width: Millimeters;
  height: Millimeters;
  depth: Millimeters;
  name?: string;
}

const DECK: Material = { id: "melamine-18-white", name: "Melamina 18 mm Blanco", kind: "board", thickness: 18, sheet: { width: 1830, height: 2440 }, finish: "Blanco" };
const EDGE: Material = { id: "edge-pvc-19x0.45-white", name: "Tapacanto PVC 19 x 0,45 mm Blanco", kind: "edgeband", thickness: 0.45, finish: "Blanco" };

/**
 * Estructura de tubo cuadrado: patas o parales en las cuatro esquinas y marcos rectangulares entre ellas.
 * Origen en la esquina inferior izquierda trasera, igual que los muebles de tablero.
 */
export function generateFrame(params: FrameParams): FurnitureModel {
  const { width: W, height: H, depth: D, type } = params;
  const profile = getProfile(params.profileId ?? DEFAULT_PROFILE);
  const a = profile.a;
  const withTop = params.top ?? true;
  const joint = params.joint ?? "weld";
  const deckT = withTop ? DECK.thickness! : 0;
  if (W < 4 * a || D < 4 * a || H < 200) throw new Error(`Medidas inválidas para una estructura en ${profile.name}: mínimo ${4 * a} mm de ancho y fondo, y 200 mm de alto.`);
  const levels = type === "shelving" ? params.levels ?? 4 : 1;
  if (type === "shelving" && (levels < 2 || levels > 8 || (H - 100) / (levels - 1) < 200)) throw new Error(`No caben ${levels} niveles en ${H} mm de alto: deja al menos 200 mm entre niveles (de 2 a 8 niveles).`);

  const bars: Bar[] = [];
  const panels: Panel[] = [];
  const postH = type === "table" ? H - deckT : H;
  const corners: [number, number][] = [[0, 0], [W - a, 0], [0, D - a], [W - a, D - a]];
  bars.push({ id: "post", name: type === "table" ? "Pata" : "Paral", profileId: profile.id, length: postH, qty: 4, boxes: corners.map(([x, z]) => ({ min: [x, 0, z], max: [x + a, postH, z + a] })) });

  // Alturas (cara superior) de cada marco horizontal.
  const tops: number[] = type === "table" ? [postH, ...(H >= 600 ? [150 + a] : [])] : Array.from({ length: levels }, (_, i) => Math.round(100 + a + (i * (H - 100 - a - deckT)) / (levels - 1)));
  const longBoxes = tops.flatMap((y) => [0, D - a].map((z) => ({ min: [a, y - a, z] as [number, number, number], max: [W - a, y, z + a] as [number, number, number] })));
  const shortBoxes = tops.flatMap((y) => [0, W - a].map((x) => ({ min: [x, y - a, a] as [number, number, number], max: [x + a, y, D - a] as [number, number, number] })));
  bars.push({ id: "rail-long", name: "Travesaño largo", profileId: profile.id, length: W - 2 * a, qty: longBoxes.length, boxes: longBoxes });
  bars.push({ id: "rail-short", name: "Travesaño corto", profileId: profile.id, length: D - 2 * a, qty: shortBoxes.length, boxes: shortBoxes });

  if (withTop) {
    // Mesa: una cubierta arriba. Estantería: un entrepaño por nivel, apoyado sobre su marco.
    const deckTops = type === "table" ? [postH] : tops;
    panels.push({
      id: "deck", name: type === "table" ? "Cubierta" : "Entrepaño", height: W, width: D, thickness: DECK.thickness!, materialId: DECK.id, qty: deckTops.length, grain: "along-height",
      edgeBanding: { top: true, bottom: true, left: true, right: true }, edgeMaterialId: EDGE.id,
      placement: { x: 0, y: deckTops[0], z: 0, normal: "y" },
      instances: deckTops.length > 1 ? deckTops.map((y) => ({ placement: { x: 0, y, z: 0, normal: "y" as const } })) : undefined,
      notes: "Se fija desde abajo con tornillos a través del marco, con agujeros ovalados para la dilatación.",
    });
  }

  const joints = (longBoxes.length + shortBoxes.length) * 2;
  const meters = (4 * postH + longBoxes.length * (W - 2 * a) + shortBoxes.length * (D - 2 * a)) / 1000;
  const areaM2 = meters * ((4 * a) / 1000);
  const hardware: HardwareItem[] = [];
  if (joint === "weld") hardware.push({ id: "welding-rod", name: 'Electrodo 6013 de 3/32" (kg)', qty: Math.max(1, Math.ceil(joints * 0.03)), category: "welding-rod", spec: { joints } });
  else {
    hardware.push({ id: "tube-connector", name: `Conector atornillado para tubo de ${a} mm`, qty: joints, category: "tube-connector", spec: { side: a } });
    hardware.push({ id: "self-drilling-screw", name: "Tornillo autoperforante 8 x 3/4\"", qty: joints * 4, category: "self-drilling-screw" });
  }
  hardware.push({ id: "tube-cap", name: `Regatón plástico para tubo de ${a} mm`, qty: 4, category: "tube-cap" });
  hardware.push({ id: "paint-m2", name: "Anticorrosivo y pintura (m² a cubrir)", qty: Math.max(1, Math.ceil(areaM2)), category: "paint-m2", spec: { areaM2: Number(areaM2.toFixed(2)) } });
  if (withTop) hardware.push({ id: "deck-screw", name: "Tornillo 4 x 30 mm para fijar tablero al marco", qty: panels[0].qty * 8, category: "screw" });

  const kg = Number((meters * profile.kgPerM).toFixed(1));
  const label = type === "table" ? "Mesa de tubo" : "Estantería de tubo";
  return {
    id: `frame-${type}-${W}x${H}x${D}`,
    name: params.name ?? `${label} ${W} x ${H} x ${D} mm`,
    dims: { width: W, height: H, depth: D },
    joinery: "confirmat",
    panels,
    hardware,
    materials: withTop ? [DECK, EDGE] : [],
    bars,
    meta: { generator: "frame", params, profile: profile.id, joint, joints, steelKg: kg, steelMeters: Number(meters.toFixed(2)) },
  };
}
