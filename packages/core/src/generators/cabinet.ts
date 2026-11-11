import type {
  FurnitureModel,
  HardwareItem,
  Joinery,
  Material,
  Millimeters,
  Panel,
  Placement,
} from "../model/index.js";

export interface CabinetParams {
  width: Millimeters;
  height: Millimeters;
  depth: Millimeters;
  /** Espesor del tablero principal. Por defecto 18 mm (estándar melamina). */
  boardThickness?: Millimeters;
  /** Espesor del fondo (trasera). Por defecto 3 mm (HDF/MDF). */
  backThickness?: Millimeters;
  /** Cantidad de repisas interiores (móviles). */
  shelves?: number;
  /** 0, 1 o 2 puertas batientes con bisagra cazoleta 35 mm. */
  doors?: 0 | 1 | 2;
  /** Sistema de unión. Por defecto confirmat (económico y fuerte); minifix para "sin tornillos visibles". */
  joinery?: Joinery;
  /** Zócalo frontal (altura). 0 = sin zócalo. */
  plinthHeight?: Millimeters;
  materialId?: string;
  backMaterialId?: string;
  edgeMaterialId?: string;
  name?: string;
}

/** Holguras y constantes constructivas estándar en carpintería de melamina. */
export const CABINET_RULES = {
  /** Holgura entre puertas y bordes del mueble. */
  doorGap: 2,
  /** Holgura lateral de las repisas respecto a los costados. */
  shelfSideClearance: 1,
  /** Retranqueo frontal de las repisas respecto al frente. */
  shelfFrontSetback: 10,
  /** Profundidad de la ranura para el fondo. */
  backGrooveDepth: 8,
  /** Distancia de la ranura del fondo al canto trasero. */
  backGrooveOffset: 10,
  /** Luz mínima que se considera para el sistema 32 mm de perforado. */
  system32Pitch: 32,
} as const;

const DEFAULT_MATERIALS: Material[] = [
  {
    id: "melamine-18-white",
    name: "Melamina 18 mm Blanco",
    kind: "board",
    thickness: 18,
    sheet: { width: 1830, height: 2440 },
    finish: "Blanco",
  },
  {
    id: "hdf-3-white",
    name: "HDF 3 mm Blanco",
    kind: "board",
    thickness: 3,
    sheet: { width: 1830, height: 2440 },
    finish: "Blanco",
  },
  {
    id: "edge-pvc-19x0.45-white",
    name: "Tapacanto PVC 19 x 0,45 mm Blanco",
    kind: "edgeband",
    thickness: 0.45,
    finish: "Blanco",
  },
];

function hingesPerDoor(doorHeight: Millimeters): number {
  if (doorHeight <= 900) return 2;
  if (doorHeight <= 1600) return 3;
  if (doorHeight <= 2000) return 4;
  return 5;
}

/** Cantidad de uniones (cam/tornillo) por junta según la profundidad del mueble. */
function fastenersPerJoint(depth: Millimeters): number {
  if (depth <= 350) return 2;
  if (depth <= 600) return 3;
  return 4;
}

/**
 * Genera un gabinete de caja (box cabinet): 2 costados, piso, techo, fondo ranurado,
 * repisas móviles y puertas opcionales. Es la base de armarios, muebles de cocina,
 * bibliotecas y módulos de closet.
 */
export function generateCabinet(params: CabinetParams): FurnitureModel {
  const t = params.boardThickness ?? 18;
  const tb = params.backThickness ?? 3;
  const { width: W, height: H, depth: D } = params;
  const shelves = params.shelves ?? 0;
  const doors = params.doors ?? 0;
  const joinery: Joinery = params.joinery ?? "confirmat";
  const plinth = params.plinthHeight ?? 0;
  const materialId = params.materialId ?? DEFAULT_MATERIALS[0].id;
  const backMaterialId = params.backMaterialId ?? DEFAULT_MATERIALS[1].id;
  const edgeMaterialId = params.edgeMaterialId ?? DEFAULT_MATERIALS[2].id;

  if (W <= 2 * t || H <= 2 * t || D <= CABINET_RULES.backGrooveOffset + CABINET_RULES.backGrooveDepth) {
    throw new Error("Medidas inválidas: el mueble es más pequeño que el espesor de sus piezas.");
  }

  const R = CABINET_RULES;
  const innerW = W - 2 * t;
  const innerH = H - 2 * t - plinth;
  const panels: Panel[] = [];

  const place = (x: number, y: number, z: number, normal: Placement["normal"]): Placement => ({ x, y, z, normal });

  // Costados: cantos frontales visibles.
  panels.push({
    id: "side-left",
    name: "Costado izquierdo",
    height: H,
    width: D,
    thickness: t,
    materialId,
    qty: 1,
    grain: "along-height",
    edgeBanding: { top: false, bottom: false, left: false, right: true },
    edgeMaterialId,
    placement: place(0, 0, 0, "x"),
  });
  panels.push({ ...panels[0], id: "side-right", name: "Costado derecho", placement: place(W - t, 0, 0, "x") });

  // Techo y piso.
  panels.push({
    id: "top",
    name: "Techo",
    height: innerW,
    width: D,
    thickness: t,
    materialId,
    qty: 1,
    grain: "along-height",
    edgeBanding: { top: false, bottom: false, left: false, right: true },
    edgeMaterialId,
    placement: place(t, H - t, 0, "y"),
  });
  panels.push({ ...panels[panels.length - 1], id: "bottom", name: "Piso", placement: place(t, plinth, 0, "y") });

  if (plinth > 0) {
    panels.push({
      id: "plinth",
      name: "Zócalo",
      height: innerW,
      width: plinth,
      thickness: t,
      materialId,
      qty: 1,
      grain: "along-height",
      edgeBanding: { top: false, bottom: false, left: false, right: false },
      placement: place(t, 0, D - t - 30, "z"),
      notes: "Retranqueado 30 mm del frente.",
    });
  }

  // Fondo en ranura: entra 8 mm en cada costado, piso y techo.
  panels.push({
    id: "back",
    name: "Fondo",
    height: H - 2 * t - plinth + 2 * R.backGrooveDepth,
    width: innerW + 2 * R.backGrooveDepth,
    thickness: tb,
    materialId: backMaterialId,
    qty: 1,
    grain: "none",
    edgeBanding: { top: false, bottom: false, left: false, right: false },
    placement: place(t - R.backGrooveDepth, plinth + t - R.backGrooveDepth, R.backGrooveOffset, "z"),
    notes: `Ranura de ${R.backGrooveDepth} mm a ${R.backGrooveOffset} mm del canto trasero.`,
  });

  // Repisas móviles.
  if (shelves > 0) {
    const shelfDepth = D - R.backGrooveOffset - tb - R.shelfFrontSetback;
    const gap = innerH / (shelves + 1);
    panels.push({
      id: "shelf",
      name: "Repisa",
      height: innerW - 2 * R.shelfSideClearance,
      width: shelfDepth,
      thickness: t,
      materialId,
      qty: shelves,
      grain: "along-height",
      edgeBanding: { top: false, bottom: false, left: false, right: true },
      edgeMaterialId,
      placement: place(t + R.shelfSideClearance, plinth + t + Math.round(gap), R.backGrooveOffset + tb, "y"),
      instances: Array.from({ length: shelves }, (_, i) => ({
        placement: place(t + R.shelfSideClearance, plinth + t + Math.round(gap * (i + 1)), R.backGrooveOffset + tb, "y"),
      })),
      notes: `Separación aprox. ${Math.round(gap)} mm; ajustar a múltiplos de ${R.system32Pitch} mm.`,
    });
  }

  // Puertas con bisagra cazoleta (overlay completo).
  const hardware: HardwareItem[] = [];
  if (doors > 0) {
    const doorH = H - plinth - 2 * R.doorGap;
    const doorW = Math.floor((W - R.doorGap * (doors + 1)) / doors);
    panels.push({
      id: "door",
      name: doors === 1 ? "Puerta" : "Puerta (par)",
      height: doorH,
      width: doorW,
      thickness: t,
      materialId,
      qty: doors,
      grain: "along-height",
      edgeBanding: { top: true, bottom: true, left: true, right: true },
      edgeMaterialId,
      placement: place(R.doorGap, plinth + R.doorGap, D, "z"),
      motion: { kind: "hinge", axis: "left", maxAngleDeg: 110, softClose: false },
      instances:
        doors === 2
          ? [
              { placement: place(R.doorGap, plinth + R.doorGap, D, "z"), motion: { kind: "hinge", axis: "left", maxAngleDeg: 110, softClose: false } },
              { placement: place(2 * R.doorGap + doorW, plinth + R.doorGap, D, "z"), motion: { kind: "hinge", axis: "right", maxAngleDeg: 110, softClose: false } },
            ]
          : undefined,
      notes: doors === 2 ? "Puerta izquierda con eje izquierdo; la derecha, con eje derecho." : undefined,
    });
    const hinges = hingesPerDoor(doorH) * doors;
    hardware.push({
      id: "hinge-35",
      name: "Bisagra cazoleta 35 mm con base",
      qty: hinges,
      category: "hinge",
      spec: { cup: 35, overlay: "full" },
    });
    hardware.push({ id: "handle", name: "Tirador o manilla", qty: doors, category: "handle" });
  }

  // Uniones estructurales: 4 juntas (techo-costados, piso-costados) + zócalo si existe.
  const structuralJoints = 4 + (plinth > 0 ? 2 : 0);
  const perJoint = fastenersPerJoint(D);
  const nFasteners = structuralJoints * perJoint;
  switch (joinery) {
    case "confirmat":
      hardware.push({ id: "confirmat-7x50", name: "Tornillo confirmat 7 x 50 mm", qty: nFasteners, category: "confirmat" });
      hardware.push({ id: "cap-confirmat", name: "Tapa plástica para confirmat", qty: nFasteners, category: "cap" });
      break;
    case "minifix":
      hardware.push({ id: "minifix-cam-15", name: "Excéntrica minifix 15 mm", qty: nFasteners, category: "cam-lock" });
      hardware.push({ id: "minifix-bolt", name: "Perno minifix (espiga roscada)", qty: nFasteners, category: "cam-lock" });
      hardware.push({ id: "dowel-8x30", name: "Tarugo madera 8 x 30 mm", qty: nFasteners, category: "dowel" });
      break;
    case "dowel":
      hardware.push({ id: "dowel-8x35", name: "Tarugo madera 8 x 35 mm", qty: nFasteners * 2, category: "dowel" });
      hardware.push({ id: "pva-glue", name: "Cola fría PVA (ml)", qty: 100, category: "glue" });
      break;
    case "pocket-screw":
      hardware.push({ id: "pocket-screw-32", name: "Tornillo pocket hole 32 mm", qty: nFasteners, category: "pocket-screw" });
      break;
  }
  if (shelves > 0) {
    hardware.push({ id: "shelf-pin-5", name: "Soporte de repisa 5 mm", qty: shelves * 4, category: "shelf-pin" });
  }
  hardware.push({
    id: "back-screw",
    name: "Tornillo 3,5 x 16 mm para fondo",
    qty: Math.max(8, Math.round((2 * (innerW + innerH)) / 150)),
    category: "screw",
  });
  if (plinth > 0) {
    hardware.push({ id: "leveling-foot", name: "Pata niveladora", qty: 4, category: "foot" });
  }

  return {
    id: `cabinet-${W}x${H}x${D}`,
    name: params.name ?? `Gabinete ${W} x ${H} x ${D} mm`,
    dims: { width: W, height: H, depth: D },
    joinery,
    panels,
    hardware,
    materials: DEFAULT_MATERIALS,
    meta: { generator: "cabinet", params },
  };
}
