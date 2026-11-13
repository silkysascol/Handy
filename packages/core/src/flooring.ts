import type { Millimeters } from "./model/index.js";
import type { PriceOffer, PriceProvider } from "./providers/types.js";
import type { PriceNeed } from "./pricebook.js";
import type { Room } from "./world.js";

/**
 * Pisos: cómo quedan las baldosas en una habitación, cuántas cajas comprar, cuánta pega y cuánta
 * boquilla. Todo en milímetros; la habitación es rectangular y las piezas se cuentan con los cortes
 * que realmente salen, emparejando recortes cuando dos caben en una misma baldosa.
 */
export interface FloorSpec {
  material: "ceramic" | "porcelain";
  /** Medida de la pieza a lo largo de X (muros norte y sur) y de Z (este y oeste). */
  tileWidth: Millimeters;
  tileLength: Millimeters;
  /** Espesor de la pieza, para la boquilla. */
  thickness: Millimeters;
  /** Ancho de la junta. */
  joint: Millimeters;
  /** Recto, o trabado como ladrillo con el desfase indicado (0,5 = mitad; 0,333 = un tercio). */
  pattern: "straight" | "brick";
  brickOffset: number;
  /** Centrado (cortes iguales a ambos lados) o piezas enteras desde la esquina noroeste. */
  start: "center" | "corner";
  /** Piezas por caja. Si falta, se estima para cajas de alrededor de 1,5 m². */
  piecesPerBox?: number;
}

export interface FloorTile { x: Millimeters; z: Millimeters; w: Millimeters; d: Millimeters; cut: boolean }

export interface FloorPlan {
  areaM2: number;
  tiles: FloorTile[];
  fullTiles: number;
  cutTiles: number;
  /** Baldosas necesarias emparejando recortes, sin reserva. */
  tilesNeeded: number;
  reservePct: number;
  tilesToBuy: number;
  piecesPerBox: number;
  boxes: number;
  /** m² que cubren las cajas compradas. */
  boxedM2: number;
  adhesive: { type: "estándar" | "flexible para porcelanato"; kgPerM2: number; kg: number; bags25: number; trowel: string };
  grout: { kgPerM2: number; kg: number; bags2: number };
  spacers: number;
  /** Metros de guardaescobas: perímetro menos puertas y pasos. */
  skirtingM: number;
  smallestCut: Millimeters;
  notes: string[];
}

export function defaultFloorSpec(partial: Partial<FloorSpec> = {}): FloorSpec {
  const material = partial.material ?? "ceramic";
  return { material, tileWidth: 600, tileLength: 600, thickness: material === "porcelain" ? 9 : 8, joint: material === "porcelain" ? 2 : 3, pattern: "straight", brickOffset: 0.5, start: "center", ...partial };
}

/** Dónde empieza la primera pieza de un eje para que los cortes de ambos bordes sean iguales y lo más grandes posible. */
function centeredStart(length: number, tile: number, joint: number): number {
  const m = tile + joint;
  // Pieza visible en el borde: entera si el arranque cae justo en el muro o si lo que asoma es solo junta.
  const borderOf = (start: number) => { const first = start + tile; return first >= tile - 0.5 || first <= 0 ? tile : first; };
  // Opción A: una junta en el centro. Opción B: una pieza centrada.
  const a = (length / 2 + joint / 2) % m, b = (length / 2 - tile / 2) % m;
  const startA = a === 0 ? 0 : a - m, startB = b === 0 ? 0 : b - m;
  return borderOf(startA) >= borderOf(startB) ? startA : startB;
}

/** Empareja recortes: de una baldosa salen dos si caben con el disco y cada uno conserva un borde de fábrica. */
function tilesForCuts(cuts: number[], tile: number, kerf: number): number {
  const sorted = [...cuts].sort((x, y) => y - x);
  let count = 0;
  while (sorted.length) {
    const big = sorted.shift()!;
    const i = sorted.findIndex((c) => big + c + kerf <= tile);
    if (i >= 0) sorted.splice(i, 1);
    count++;
  }
  return count;
}

export function planFloor(room: Pick<Room, "width" | "depth" | "openings">, spec: FloorSpec): FloorPlan {
  const { tileWidth: tw, tileLength: tl, joint } = spec;
  if (tw < 50 || tl < 50) throw new Error("La baldosa debe medir al menos 50 mm por lado.");
  const W = room.width, D = room.depth;
  const mx = tw + joint, mz = tl + joint;
  const x0 = spec.start === "corner" ? 0 : centeredStart(W, tw, joint);
  const z0 = spec.start === "corner" ? 0 : centeredStart(D, tl, joint);

  const tiles: FloorTile[] = [];
  let row = 0;
  for (let z = z0; z < D; z += mz, row++) {
    const shift = spec.pattern === "brick" && row % 2 === 1 ? -Math.round(mx * spec.brickOffset) : 0;
    for (let x = x0 + shift; x < W; x += mx) {
      const cx0 = Math.max(0, x), cz0 = Math.max(0, z), cx1 = Math.min(W, x + tw), cz1 = Math.min(D, z + tl);
      const w = cx1 - cx0, d = cz1 - cz0;
      if (w < 1 || d < 1) continue;
      tiles.push({ x: Math.round(cx0), z: Math.round(cz0), w: Math.round(w), d: Math.round(d), cut: w < tw - 0.5 || d < tl - 0.5 });
    }
  }

  const full = tiles.filter((t) => !t.cut);
  const cuts = tiles.filter((t) => t.cut);
  const kerf = 3;
  const onlyX = cuts.filter((t) => t.d >= tl - 0.5).map((t) => t.w);
  const onlyZ = cuts.filter((t) => t.w >= tw - 0.5).map((t) => t.d);
  const corners = cuts.filter((t) => t.w < tw - 0.5 && t.d < tl - 0.5).length;
  const tilesNeeded = full.length + tilesForCuts(onlyX, tw, kerf) + tilesForCuts(onlyZ, tl, kerf) + corners;

  const reservePct = spec.pattern === "brick" ? 10 : 5;
  const tilesToBuy = Math.ceil(tilesNeeded * (1 + reservePct / 100));
  const tileM2 = (tw * tl) / 1e6;
  const piecesPerBox = spec.piecesPerBox ?? Math.max(1, Math.round(1.5 / tileM2));
  const boxes = Math.ceil(tilesToBuy / piecesPerBox);
  const areaM2 = (W * D) / 1e6;

  const maxSide = Math.max(tw, tl);
  const kgPerM2 = maxSide <= 300 ? 4 : maxSide <= 600 ? 5.5 : 7.5;
  const flexible = spec.material === "porcelain" || maxSide > 600;
  const adhesiveKg = Math.ceil(areaM2 * kgPerM2 * 1.05);
  // Fórmula habitual de los fabricantes: (A + B) / (A × B) × espesor × junta × 1,6 = kg/m².
  const groutPerM2 = ((tw + tl) / (tw * tl)) * spec.thickness * joint * 1.6;
  const groutKg = Number((areaM2 * groutPerM2 * 1.1).toFixed(1));

  const doorways = room.openings.filter((o) => o.type !== "window").reduce((s, o) => s + o.width, 0);
  const smallestCut = cuts.length ? Math.min(...cuts.map((t) => Math.min(t.w < tw - 0.5 ? t.w : Infinity, t.d < tl - 0.5 ? t.d : Infinity))) : 0;
  const notes: string[] = [];
  if (smallestCut && smallestCut < 50) notes.push(`Queda un corte de solo ${smallestCut} mm: difícil de cortar y de pegar. Mueve el arranque o cambia el ancho de junta.`);
  if (spec.pattern === "brick" && spec.brickOffset > 0.34 && maxSide >= 600) notes.push("En piezas largas, trabar a la mitad marca el desnivel entre piezas. Usa un tercio.");
  if (spec.material === "porcelain") notes.push("El porcelanato se corta con disco diamantado continuo o cortadora de rodel de buena calidad.");
  if (maxSide > 600) notes.push("Formato grande: doble encolado (pega en el piso y en la pieza) y niveladores.");

  return {
    areaM2: Number(areaM2.toFixed(2)), tiles, fullTiles: full.length, cutTiles: cuts.length, tilesNeeded, reservePct, tilesToBuy, piecesPerBox, boxes,
    boxedM2: Number((boxes * piecesPerBox * tileM2).toFixed(2)),
    adhesive: { type: flexible ? "flexible para porcelanato" : "estándar", kgPerM2, kg: adhesiveKg, bags25: Math.ceil(adhesiveKg / 25), trowel: maxSide <= 300 ? "llana dentada de 6 a 8 mm" : maxSide <= 600 ? "llana dentada de 10 mm" : "llana dentada de 12 mm, doble encolado" },
    grout: { kgPerM2: Number(groutPerM2.toFixed(3)), kg: groutKg, bags2: Math.max(1, Math.ceil(groutKg / 2)) },
    spacers: tiles.length * 4,
    skirtingM: Number(((2 * (W + D) - doorways) / 1000).toFixed(1)),
    smallestCut, notes,
  };
}

export interface FloorQuoteLine { description: string; category: string; qty: number; unit: PriceOffer["unit"]; unitPrice: number; total: number; offer?: PriceOffer; missing: boolean; need: PriceNeed }

/** Líneas de cotización de un piso: cajas, sacos de pega y boquilla. Lo que no tiene precio queda marcado. */
export async function quoteFloor(roomName: string, spec: FloorSpec, plan: FloorPlan, providers: PriceProvider[]): Promise<FloorQuoteLine[]> {
  const search = async (category: string) => (await Promise.all(providers.map((p) => p.search({ category }).catch(() => [] as PriceOffer[])))).flat();
  const sizeOf = (o: PriceOffer) => [Number(o.attributes?.width), Number(o.attributes?.length)].sort((a, b) => a - b).join("x");
  const wanted = [spec.tileWidth, spec.tileLength].sort((a, b) => a - b).join("x");
  // Entre tiendas se compara el precio por pieza: las cajas no traen lo mismo.
  const perPiece = (o: PriceOffer) => o.price / (Number(o.attributes?.piecesPerBox) || plan.piecesPerBox);
  const tile = (await search("tile")).filter((o) => o.attributes?.material === spec.material && sizeOf(o) === wanted).sort((a, b) => perPiece(a) - perPiece(b))[0];
  const flexible = plan.adhesive.type !== "estándar";
  const adhesive = (await search("tile-adhesive")).filter((o) => Boolean(o.attributes?.flexible) === flexible).sort((a, b) => a.price - b.price)[0];
  const grout = (await search("grout")).sort((a, b) => a.price - b.price)[0];
  // Si la tienda vende cajas con otra cantidad de piezas, se recalculan las cajas.
  const perBox = Number(tile?.attributes?.piecesPerBox) || plan.piecesPerBox;
  const boxes = Math.ceil(plan.tilesToBuy / perBox);
  const kind = spec.material === "porcelain" ? "Porcelanato" : "Cerámica";
  const line = (description: string, need: PriceNeed, qty: number, offer?: PriceOffer): FloorQuoteLine => ({ description, category: need.category, qty, unit: need.unit, unitPrice: offer?.price ?? 0, total: (offer?.price ?? 0) * qty, offer, missing: !offer, need });
  return [
    line(`${roomName} · ${kind} ${spec.tileWidth / 10} x ${spec.tileLength / 10} cm (caja de ${perBox})`, { category: "tile", unit: "pack", attributes: { material: spec.material, width: Math.min(spec.tileWidth, spec.tileLength), length: Math.max(spec.tileWidth, spec.tileLength) } }, boxes, tile),
    line(`${roomName} · Pega ${plan.adhesive.type} 25 kg`, { category: "tile-adhesive", unit: "unit", attributes: { flexible } }, plan.adhesive.bags25, adhesive),
    line(`${roomName} · Boquilla 2 kg`, { category: "grout", unit: "unit" }, plan.grout.bags2, grout),
  ];
}
