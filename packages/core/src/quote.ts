import type { FurnitureModel } from "./model/index.js";
import { buildCutlist, type Cutlist } from "./cutlist.js";
import { unitCost, type PriceOffer, type PriceProvider } from "./providers/types.js";
import type { PriceNeed } from "./pricebook.js";
import { planBars } from "./barcut.js";

export interface QuoteLine {
  description: string;
  category: string;
  qty: number;
  unit: PriceOffer["unit"];
  unitPrice: number;
  total: number;
  offer?: PriceOffer;
  /** true si no se encontró precio y la línea queda en 0. */
  missing: boolean;
  /** Qué precio hace falta para este renglón; con esto se anota uno propio que le sirva. */
  need: PriceNeed;
}

/** Cuánto se compra y cuánto cuesta, según la oferta venga por unidad o por paquete (caja, rollo). */
export function purchase(count: number, offer?: PriceOffer): { qty: number; unit: PriceOffer["unit"] | undefined; total: number } {
  const qty = offer?.unit === "pack" && offer.packSize ? Math.ceil(count / offer.packSize) : count;
  return { qty, unit: offer?.unit, total: (offer?.price ?? 0) * qty };
}

export interface Quote {
  currency: string;
  lines: QuoteLine[];
  subtotal: number;
  /** Fecha más antigua entre los precios usados. */
  oldestPrice?: string;
  missingCount: number;
  cutlist: Cutlist;
}

async function bestOffer(providers: PriceProvider[], query: Parameters<PriceProvider["search"]>[0]): Promise<PriceOffer | undefined> {
  const results = await Promise.all(providers.map((p) => p.search(query).catch(() => [] as PriceOffer[])));
  return results.flat().sort((a, b) => unitCost(a) - unitCost(b))[0];
}

/**
 * Cotización aproximada: tableros por formato completo (con desperdicio), tapacanto por metro
 * y herrajes por unidad o paquete. Si un proveedor no tiene el ítem la línea queda marcada como faltante.
 */
export async function buildQuote(model: FurnitureModel, providers: PriceProvider[], opts: { wasteFactor?: number; region?: string } = {}): Promise<Quote> {
  const cutlist = buildCutlist(model, opts.wasteFactor);
  const lines: QuoteLine[] = [];
  let currency = "";
  let oldest: string | undefined;

  const note = (offer?: PriceOffer) => {
    if (!offer) return;
    currency ||= offer.currency;
    if (!oldest || offer.fetchedAt < oldest) oldest = offer.fetchedAt;
  };

  for (const m of cutlist.materials) {
    const mat = model.materials.find((x) => x.id === m.materialId);
    const offer = await bestOffer(providers, { category: "board", thickness: m.thickness, finish: mat?.finish, region: opts.region });
    note(offer);
    lines.push({
      description: mat?.name ?? m.materialId,
      category: "board",
      qty: m.sheetsEstimate,
      unit: "sheet",
      unitPrice: offer?.price ?? 0,
      total: (offer?.price ?? 0) * m.sheetsEstimate,
      offer,
      missing: !offer,
      need: { category: "board", unit: "sheet", attributes: { thickness: m.thickness, ...(mat?.finish ? { finish: mat.finish } : {}) } },
    });
  }

  for (const [edgeId, meters] of Object.entries(cutlist.edgeBandMeters)) {
    const mat = model.materials.find((x) => x.id === edgeId);
    const offer = await bestOffer(providers, { category: "edgeband", finish: mat?.finish, region: opts.region });
    note(offer);
    // Por metro, o por rollo si así lo vende la tienda.
    const buy = purchase(Math.ceil(meters * 1.1), offer);
    lines.push({
      description: mat?.name ?? edgeId,
      category: "edgeband",
      qty: buy.qty,
      unit: buy.unit ?? "meter",
      unitPrice: offer?.price ?? 0,
      total: buy.total,
      offer,
      missing: !offer,
      need: { category: "edgeband", unit: "meter", ...(mat?.finish ? { attributes: { finish: mat.finish } } : {}) },
    });
  }

  // Perfiles metálicos: barras comerciales enteras según el despiece lineal.
  if (model.bars?.length) {
    const offers = (await Promise.all(providers.map((p) => p.search({ category: "steel-profile", region: opts.region }).catch(() => [] as PriceOffer[])))).flat();
    for (const t of planBars(model.bars).totals) {
      const offer = offers.filter((o) => o.attributes?.profileId === t.profileId).sort((a, b) => a.price - b.price)[0];
      note(offer);
      lines.push({ description: `${t.profileName} · barra de 6 m`, category: "steel-profile", qty: t.bars, unit: "unit", unitPrice: offer?.price ?? 0, total: (offer?.price ?? 0) * t.bars, offer, missing: !offer, need: { category: "steel-profile", unit: "unit", attributes: { profileId: t.profileId } } });
    }
  }

  for (const h of model.hardware) {
    const offer = await bestOffer(providers, { category: h.category, text: undefined, region: opts.region, itemId: h.id });
    note(offer);
    const buy = purchase(h.qty, offer);
    lines.push({
      description: h.name,
      category: h.category,
      qty: buy.qty,
      unit: buy.unit ?? "unit",
      unitPrice: offer?.price ?? 0,
      total: buy.total,
      offer,
      missing: !offer,
      need: { category: h.category, unit: "unit", itemId: h.id },
    });
  }

  const subtotal = Number(lines.reduce((s, l) => s + l.total, 0).toFixed(2));
  return {
    currency: currency || "?",
    lines,
    subtotal,
    oldestPrice: oldest,
    missingCount: lines.filter((l) => l.missing).length,
    cutlist,
  };
}
