import type {
  FurnitureModel,
  HardwareItem,
  Joinery,
  Material,
  Millimeters,
  Fixture,
  Panel,
  PanelInstance,
  Placement,
} from "../model/index.js";
import { countStructuralFasteners, hingesPerDoor } from "../joints.js";

export interface CabinetParams {
  width: Millimeters;
  height: Millimeters;
  depth: Millimeters;
  /** Espesor del tablero principal. Por defecto 18 mm (estándar melamina). */
  boardThickness?: Millimeters;
  /** Espesor del fondo (trasera). Por defecto 3 mm (HDF/MDF). */
  backThickness?: Millimeters;
  /** Repisas móviles por cuerpo. Con barra de colgar solo aplican al primer cuerpo. */
  shelves?: number;
  /** Puertas batientes con bisagra cazoleta 35 mm. Más de 2 exige 2 por cuerpo. */
  doors?: number;
  /** Divisiones verticales: el mueble queda con `dividers + 1` cuerpos de igual ancho. */
  dividers?: number;
  /** Cajones con corredera telescópica, apilados abajo en el primer cuerpo. */
  drawers?: number;
  /** Alto de cada frente de cajón. Por defecto 200 mm. */
  drawerHeight?: Millimeters;
  /** Barra de colgar con maletero encima. Con divisiones va en todos los cuerpos menos el primero. */
  hangingBar?: boolean;
  /** Sistema de unión. Por defecto confirmat (económico y fuerte); minifix para "sin tornillos visibles". */
  joinery?: Joinery;
  /** Zócalo frontal (altura). 0 = sin zócalo. */
  plinthHeight?: Millimeters;
  /**
   * Cubierta sobre el mueble, en el mismo tablero: vuela al frente y puede llevar esquinas redondeadas.
   * Su espesor cuenta dentro de la altura total: el cuerpo del mueble queda más bajo.
   */
  countertop?: CountertopOptions;
  /** El módulo va bajo el mesón corrido de un vecino: su cuerpo baja el espesor del tablero y no lleva cubierta propia. */
  underCountertop?: boolean;
  materialId?: string;
  backMaterialId?: string;
  edgeMaterialId?: string;
  name?: string;
}

export interface CountertopOptions {
  /** Cuánto sobresale del frente del mueble (puertas incluidas). Por defecto 20 mm. */
  overhang?: Millimeters;
  /** Radio de las esquinas redondeadas; sin él, esquinas rectas. */
  cornerRadius?: Millimeters;
  /** Redondear las cuatro esquinas (mueble suelto) y no solo las dos del frente. */
  roundAll?: boolean;
  /** Largo total cuando la cubierta sigue sobre los módulos vecinos de la derecha (mesón corrido). Por defecto, el ancho del mueble. */
  span?: Millimeters;
}

/** Límites del radio de una esquina redondeada: menos de 10 mm no se nota, y no puede pasar de la mitad del lado corto. */
export function assertCornerRadius(radius: number, width: number, depth: number): void {
  if (radius < 10) throw new Error("El radio de las esquinas debe ser de al menos 10 mm.");
  if (radius > Math.min(width, depth) / 2) throw new Error(`El radio de ${radius} mm no cabe: la pieza mide ${width} x ${depth} mm, así que el máximo es ${Math.floor(Math.min(width, depth) / 2)} mm.`);
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



/** Cantidad de uniones (cam/tornillo) por junta según la profundidad del mueble. */


/**
 * Genera un mueble de caja: 2 costados, piso, techo y fondo ranurado, con divisiones verticales,
 * repisas, cajones, barra de colgar y puertas opcionales. Con esas opciones cubre gabinetes,
 * bibliotecas, closets, cajoneras y módulos de cocina.
 */
export function generateCabinet(params: CabinetParams): FurnitureModel {
  const t = params.boardThickness ?? 18;
  const tb = params.backThickness ?? 3;
  const { width: W, depth: D } = params;
  // Con cubierta, el cuerpo del mueble baja lo que mide ella: la altura pedida es la total.
  const counterT = params.countertop || params.underCountertop ? t : 0;
  const H = params.height - counterT;
  const shelves = params.shelves ?? 0;
  const doors = params.doors ?? 0;
  const dividers = params.dividers ?? 0;
  const drawers = params.drawers ?? 0;
  const drawerH = params.drawerHeight ?? 200;
  const hasBar = params.hangingBar ?? false;
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
  const bays = dividers + 1;
  const bayW = Math.floor((innerW - dividers * t) / bays);
  if (dividers < 0 || bayW < 150) throw new Error(`Demasiadas divisiones: cada cuerpo quedaría de ${bayW} mm. Deja al menos 150 mm por cuerpo.`);
  if (doors < 0 || doors > 8 || (doors > 2 && doors !== 2 * bays)) {
    throw new Error(`Con ${bays} cuerpo(s) usa 0, 1, 2 o ${2 * bays} puertas (2 por cuerpo); pediste ${doors}.`);
  }
  const y0 = plinth + t; // piso interior
  const y1 = H - t; // techo interior
  const zBack = R.backGrooveOffset + tb; // cara frontal del fondo
  const innerDepth = D - zBack;
  const drawersZone = drawers * drawerH;
  if (drawers < 0 || (drawers > 0 && (drawerH < 100 || plinth + drawersZone > H - t))) {
    throw new Error(`No caben ${drawers} cajones de ${drawerH} mm en ${H} mm de alto.`);
  }
  const bayX = (i: number) => t + i * (bayW + t);
  const panels: Panel[] = [];
  const hardware: HardwareItem[] = [];
  const fixtures: Fixture[] = [];

  const place = (x: number, y: number, z: number, normal: Placement["normal"], along?: Placement["along"]): Placement => (along ? { x, y, z, normal, along } : { x, y, z, normal });
  const none = { top: false, bottom: false, left: false, right: false };
  const frontEdge = { top: false, bottom: false, left: false, right: true };

  // Costados: cantos frontales visibles.
  panels.push({ id: "side-left", name: "Costado izquierdo", height: H, width: D, thickness: t, materialId, qty: 1, grain: "along-height", edgeBanding: frontEdge, edgeMaterialId, placement: place(0, 0, 0, "x") });
  panels.push({ ...panels[0], id: "side-right", name: "Costado derecho", placement: place(W - t, 0, 0, "x") });

  // Techo y piso.
  panels.push({ id: "top", name: "Techo", height: innerW, width: D, thickness: t, materialId, qty: 1, grain: "along-height", edgeBanding: frontEdge, edgeMaterialId, placement: place(t, H - t, 0, "y") });
  panels.push({ ...panels[panels.length - 1], id: "bottom", name: "Piso", placement: place(t, plinth, 0, "y") });

  if (plinth > 0) {
    panels.push({ id: "plinth", name: "Zócalo", height: innerW, width: plinth, thickness: t, materialId, qty: 1, grain: "along-height", edgeBanding: none, placement: place(t, 0, D - t - 30, "z", "x"), notes: "Retranqueado 30 mm del frente." });
  }

  // Fondo en ranura: entra 8 mm en cada costado, piso y techo.
  panels.push({
    id: "back", name: "Fondo", height: innerH + 2 * R.backGrooveDepth, width: innerW + 2 * R.backGrooveDepth, thickness: tb, materialId: backMaterialId, qty: 1, grain: "none", edgeBanding: none,
    placement: place(t - R.backGrooveDepth, y0 - R.backGrooveDepth, R.backGrooveOffset, "z"),
    notes: `Ranura de ${R.backGrooveDepth} mm a ${R.backGrooveOffset} mm del canto trasero.`,
  });

  // Divisiones verticales entre piso y techo.
  if (dividers > 0) {
    panels.push({
      id: "divider", name: "División", height: innerH, width: innerDepth, thickness: t, materialId, qty: dividers, grain: "along-height", edgeBanding: frontEdge, edgeMaterialId,
      placement: place(bayX(0) + bayW, y0, zBack, "x"),
      instances: dividers > 1 ? Array.from({ length: dividers }, (_, i) => ({ placement: place(bayX(i) + bayW, y0, zBack, "x") })) : undefined,
    });
  }

  // Reparto de cuerpos: con barra, el primero lleva repisas y cajones y el resto cuelga ropa.
  const all = Array.from({ length: bays }, (_, i) => i);
  const barBays = hasBar ? (bays === 1 ? [0] : all.slice(1)) : [];
  const shelfBays = hasBar ? (bays === 1 ? [] : [0]) : all;
  const overlayDrawers = drawers > 0 && doors === 0;
  // Entrepaño fijo que cierra por arriba la zona de cajones, si queda espacio útil encima.
  const fixedShelfY = plinth + drawersZone - t / 2;
  const hasFixedShelf = drawers > 0 && fixedShelfY + t < y1 - 100;
  const shelfDepth = innerDepth - R.shelfFrontSetback;

  if (shelves > 0 && shelfBays.length > 0) {
    const inst: { placement: Placement }[] = [];
    let firstGap = 0;
    for (const b of shelfBays) {
      const from = b === 0 && hasFixedShelf ? fixedShelfY + t : b === 0 && drawers > 0 ? y1 : y0;
      const gap = (y1 - from) / (shelves + 1);
      if (gap < 60) continue;
      firstGap ||= gap;
      for (let k = 0; k < shelves; k++) inst.push({ placement: place(bayX(b) + R.shelfSideClearance, from + Math.round(gap * (k + 1)), zBack, "y") });
    }
    if (inst.length) {
      panels.push({
        id: "shelf", name: "Repisa", height: bayW - 2 * R.shelfSideClearance, width: shelfDepth, thickness: t, materialId, qty: inst.length, grain: "along-height", edgeBanding: frontEdge, edgeMaterialId,
        placement: inst[0].placement, instances: inst,
        notes: `Separación aprox. ${Math.round(firstGap)} mm; ajustar a múltiplos de ${R.system32Pitch} mm.`,
      });
      hardware.push({ id: "shelf-pin-5", name: "Soporte de repisa 5 mm", qty: inst.length * 4, category: "shelf-pin" });
    }
  }

  // Barra de colgar con maletero: repisa fija arriba y el tubo debajo.
  if (barBays.length > 0) {
    const roomy = y1 - y0 >= 900;
    const topShelfY = y1 - 350 - t;
    if (roomy) {
      const inst = barBays.map((b) => ({ placement: place(bayX(b), topShelfY, zBack, "y") }));
      panels.push({ id: "shelf-top", name: "Maletero", height: bayW, width: shelfDepth, thickness: t, materialId, qty: inst.length, grain: "along-height", edgeBanding: frontEdge, edgeMaterialId, placement: inst[0].placement, instances: inst.length > 1 ? inst : undefined, notes: "Repisa fija sobre la barra de colgar." });
    }
    const rodY = (roomy ? topShelfY : y1) - 75;
    const rodZ = zBack + Math.round(innerDepth / 2);
    for (const b of barBays) fixtures.push({ id: `rod-${b + 1}`, name: "Barra de colgar", kind: "rod", box: { min: [bayX(b) + 3, rodY, rodZ - 8], max: [bayX(b) + bayW - 3, rodY + 30, rodZ + 8] } });
    hardware.push({ id: "closet-rod", name: "Tubo de colgar ovalado (m)", qty: Math.ceil((barBays.length * (bayW - 6)) / 1000), category: "closet-rod", spec: { lengthEach: bayW - 6, pieces: barBays.length } });
    hardware.push({ id: "rod-support", name: "Soporte lateral para tubo de colgar", qty: barBays.length * 2, category: "rod-support" });
  }

  // Cajones en el primer cuerpo: caja de 4 lados, fondo de HDF y, si no hay puertas, frente visible.
  if (drawers > 0) {
    const slide = Math.max(250, Math.min(550, Math.floor((innerDepth - 20) / 50) * 50));
    if (slide > innerDepth - 2) throw new Error(`El fondo de ${D} mm no alcanza para correderas de cajón (mínimo 250 mm de corredera).`);
    const boxW = bayW - 26; // 13 mm por lado para la corredera telescópica
    const boxH = drawerH - 50;
    const zb = D - 2 - slide; // la caja llega hasta 2 mm detrás del frente
    const bx = bayX(0) + 13;
    const motion = { kind: "slide" as const, direction: "front" as const, travel: slide, loadKg: 30, softClose: false };
    const sides: PanelInstance[] = [], ends: PanelInstance[] = [], bottoms: PanelInstance[] = [], fronts: PanelInstance[] = [];
    const frontX0 = R.doorGap;
    const frontX1 = (bays > 1 ? t + bayW + t / 2 : W) - R.doorGap;
    for (let i = 0; i < drawers; i++) {
      const by = y0 + 10 + i * drawerH;
      sides.push({ placement: place(bx, by, zb, "x", "z"), motion }, { placement: place(bx + boxW - t, by, zb, "x", "z"), motion });
      ends.push({ placement: place(bx + t, by, zb, "z", "x"), motion }, { placement: place(bx + t, by, zb + slide - t, "z", "x"), motion });
      bottoms.push({ placement: place(bx, by - tb, zb, "y", "z"), motion });
      if (overlayDrawers) fronts.push({ placement: place(frontX0, plinth + R.doorGap + i * drawerH, D, "z", "x"), motion });
    }
    panels.push({ id: "drawer-side", name: "Cajón · costado", height: slide, width: boxH, thickness: t, materialId, qty: sides.length, grain: "along-height", edgeBanding: { top: false, bottom: false, left: true, right: false }, edgeMaterialId, placement: sides[0].placement, motion, instances: sides });
    panels.push({ id: "drawer-end", name: "Cajón · frente interior y trasera", height: boxW - 2 * t, width: boxH, thickness: t, materialId, qty: ends.length, grain: "along-height", edgeBanding: { top: false, bottom: false, left: true, right: false }, edgeMaterialId, placement: ends[0].placement, motion, instances: ends });
    panels.push({ id: "drawer-bottom", name: "Cajón · fondo", height: slide, width: boxW, thickness: tb, materialId: backMaterialId, qty: drawers, grain: "none", edgeBanding: none, placement: bottoms[0].placement, motion, instances: drawers > 1 ? bottoms : undefined });
    if (overlayDrawers) {
      panels.push({ id: "drawer-front", name: "Cajón · frente", height: frontX1 - frontX0, width: drawerH - R.doorGap, thickness: t, materialId, qty: drawers, grain: "along-height", edgeBanding: { top: true, bottom: true, left: true, right: true }, edgeMaterialId, placement: fronts[0].placement, motion, instances: drawers > 1 ? fronts : undefined });
      hardware.push({ id: "handle", name: "Tirador o manilla", qty: drawers, category: "handle" });
    }
    if (hasFixedShelf) {
      panels.push({ id: "shelf-fixed", name: "Entrepaño fijo sobre cajones", height: bayW, width: shelfDepth, thickness: t, materialId, qty: 1, grain: "along-height", edgeBanding: frontEdge, edgeMaterialId, placement: place(bayX(0), fixedShelfY, zBack, "y") });
    }
    hardware.push({ id: `slide-${slide}`, name: `Corredera telescópica ${slide} mm (par)`, qty: drawers, category: "slide", spec: { length: slide, loadKg: 30 } });
    hardware.push({ id: "drawer-screw", name: "Tornillo 3,5 x 16 mm para correderas y cajón", qty: drawers * 20, category: "screw" });
  }

  // Puertas con bisagra cazoleta (overlay completo). Se alternan los ejes: izquierda, derecha, ...
  if (doors > 0) {
    const doorH = H - plinth - 2 * R.doorGap;
    const doorW = Math.floor((W - R.doorGap * (doors + 1)) / doors);
    const hinge = (i: number) => ({ kind: "hinge" as const, axis: (i % 2 === 0 ? "left" : "right") as "left" | "right", maxAngleDeg: 110, softClose: false });
    panels.push({
      id: "door", name: doors === 1 ? "Puerta" : doors === 2 ? "Puerta (par)" : "Puerta", height: doorH, width: doorW, thickness: t, materialId, qty: doors, grain: "along-height",
      edgeBanding: { top: true, bottom: true, left: true, right: true }, edgeMaterialId,
      placement: place(R.doorGap, plinth + R.doorGap, D, "z"),
      motion: hinge(0),
      instances: doors > 1 ? Array.from({ length: doors }, (_, i) => ({ placement: place(R.doorGap + i * (doorW + R.doorGap), plinth + R.doorGap, D, "z"), motion: hinge(i) })) : undefined,
      notes: doors > 1 ? "Ejes alternados: la primera abre con bisagras a la izquierda, la siguiente a la derecha." : undefined,
    });
    hardware.push({ id: "hinge-35", name: "Bisagra cazoleta 35 mm con base", qty: hingesPerDoor(doorH) * doors, category: "hinge", spec: { cup: 35, overlay: "full" } });
    hardware.push({ id: "handle", name: "Tirador o manilla", qty: doors, category: "handle" });
  }

  // La cantidad sale de la geometría: cada canto que toca una cara, con herrajes según su largo.
  const nFasteners = countStructuralFasteners(panels);
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
  hardware.push({ id: "back-screw", name: "Tornillo 3,5 x 16 mm para fondo", qty: Math.max(8, Math.round((2 * (innerW + innerH)) / 150)), category: "screw" });
  if (plinth > 0) hardware.push({ id: "leveling-foot", name: "Pata niveladora", qty: W > 1200 ? 6 : 4, category: "foot" });

  if (params.countertop) {
    const c = params.countertop;
    const frontT = doors > 0 || drawers > 0 ? t : 0;
    const depth = D + frontT + (c.overhang ?? 20);
    // Un mesón corrido arranca en este módulo y sigue sobre los vecinos de su derecha.
    const span = Math.max(W, c.span ?? W);
    if (c.cornerRadius) assertCornerRadius(c.cornerRadius, span, depth);
    const all = !!c.roundAll;
    panels.push({
      id: "countertop", name: span > W ? "Mesón corrido" : "Cubierta", height: span, width: depth, thickness: t, materialId, qty: 1, grain: "along-height",
      // "right" es el canto del frente y "left" el de atrás, que solo se enchapa si el mueble va suelto.
      edgeBanding: { top: true, bottom: true, left: all, right: true }, edgeMaterialId,
      placement: { x: 0, y: H, z: 0, normal: "y" },
      ...(c.cornerRadius ? { cornerRadius: c.cornerRadius, roundedCorners: all ? "all" as const : "front" as const } : {}),
      notes: `Vuela ${c.overhang ?? 20} mm del frente. Se fija desde adentro, por el techo del mueble.${c.cornerRadius ? ` Redondear ${all ? "las 4 esquinas" : "las 2 esquinas del frente"} a R${c.cornerRadius} después del corte.` : ""}`,
    });
    hardware.push({ id: "countertop-screw", name: "Tornillo 4 x 30 mm para fijar la cubierta", qty: Math.max(4, Math.ceil(W / 300) * 2), category: "screw" });
  }
  // Un mismo herraje puede venir de varias partes (tiradores de puertas y de cajones): se suma.
  const merged = new Map<string, HardwareItem>();
  for (const h of hardware) { const cur = merged.get(h.id); if (cur) cur.qty += h.qty; else merged.set(h.id, { ...h }); }
  // Las puertas van al final de la lista para que el orden de armado y de corte sea estable.
  const doorIdx = panels.findIndex((p) => p.id === "door");
  if (doorIdx >= 0) panels.push(...panels.splice(doorIdx, 1));

  const kind = hasBar ? "Closet" : drawers > 0 && doors === 0 && shelves === 0 && dividers === 0 ? "Cajonera" : "Gabinete";
  return {
    id: `cabinet-${W}x${params.height}x${D}`,
    name: params.name ?? `${kind} ${W} x ${params.height} x ${D} mm`,
    dims: { width: W, height: params.height, depth: D },
    joinery,
    panels,
    hardware: [...merged.values()],
    materials: DEFAULT_MATERIALS,
    fixtures: fixtures.length ? fixtures : undefined,
    meta: { generator: "cabinet", params },
  };
}
