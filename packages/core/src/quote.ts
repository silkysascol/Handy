import type { FurnitureModel } from "./model/index.js";
import { buildCutlist, type Cutlist } from "./cutlist.js";
import type { PriceOffer, PriceProvider } from "./providers/types.js";
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
  return results.flat().sort((a, b) => a.price - b.price)[0];
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
    });
  }

  for (const [edgeId, meters] of Object.entries(cutlist.edgeBandMeters)) {
    const mat = model.materials.find((x) => x.id === edgeId);
    const qty = Math.ceil(meters * 1.1);
    const offer = await bestOffer(providers, { category: "edgeband", finish: mat?.finish, region: opts.region });
    note(offer);
    lines.push({
      description: mat?.name ?? edgeId,
      category: "edgeband",
      qty,
      unit: "meter",
      unitPrice: offer?.price ?? 0,
      total: (offer?.price ?? 0) * qty,
      offer,
      missing: !offer,
    });
  }

  // Perfiles metálicos: barras comerciales enteras según el despiece lineal.
  if (model.bars?.length) {
    const offers = (await Promise.all(providers.map((p) => p.search({ category: "steel-profile", region: opts.region }).catch(() => [] as PriceOffer[])))).flat();
    for (const t of planBars(model.bars).totals) {
      const offer = offers.filter((o) => o.attributes?.profileId === t.profileId).sort((a, b) => a.price - b.price)[0];
      note(offer);
      lines.push({ description: `${t.profileName} · barra de 6 m`, category: "steel-profile", qty: t.bars, unit: "unit", unitPrice: offer?.price ?? 0, total: (offer?.price ?? 0) * t.bars, offer, missing: !offer });
    }
  }

  for (const h of model.hardware) {
    const offer = await bestOffer(providers, { category: h.category, text: undefined, region: opts.region });
    note(offer);
    const packs = offer?.unit === "pack" && offer.packSize ? Math.ceil(h.qty / offer.packSize) : h.qty;
    lines.push({
      description: h.name,
      category: h.category,
      qty: packs,
      unit: offer?.unit ?? "unit",
      unitPrice: offer?.price ?? 0,
      total: (offer?.price ?? 0) * packs,
      offer,
      missing: !offer,
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
