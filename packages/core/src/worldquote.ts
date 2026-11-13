import { buildQuote, type QuoteLine } from "./quote.js";
import { planFloor, quoteFloor } from "./flooring.js";
import type { PriceProvider } from "./providers/types.js";
import { priceAgeDays } from "./pricebook.js";
import { mergedModel, type World } from "./world.js";

export interface WorldQuote {
  currency: string;
  lines: QuoteLine[];
  subtotal: number;
  missingCount: number;
  oldestPrice?: string;
  /** Subtotales por grupo: muebles y pisos. */
  groups: { furniture: number; floors: number };
  /** Qué se compra en cada tienda y cuánto suma, de mayor a menor. */
  byStore: { store: string; total: number; lines: number }[];
  /** Renglones cuyo precio tiene más de `staleDays` días. */
  staleCount: number;
  /** Monedas distintas entre los precios usados: el total no es confiable si hay más de una. */
  currencies: string[];
}

export interface WorldQuoteOptions {
  /** Hoy (AAAA-MM-DD), para medir la antigüedad de los precios. */
  today?: string;
  /** Días a partir de los cuales un precio se considera viejo. */
  staleDays?: number;
}

/** Cotiza todo el mundo: muebles (tableros según plano de corte, cantos, herrajes, perfiles) y pisos (cajas, pega, boquilla). */
export async function quoteWorld(world: World, providers: PriceProvider[], itemIds?: string[], opts: WorldQuoteOptions = {}): Promise<WorldQuote> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const staleDays = opts.staleDays ?? 30;
  const lines: QuoteLine[] = [];
  let oldest: string | undefined, furniture = 0, floors = 0;
  const stores = new Map<string, { total: number; lines: number }>();
  const currencies = new Set<string>();
  let stale = 0;
  const note = (l: QuoteLine) => {
    if (!l.offer) return;
    currencies.add(l.offer.currency);
    if (!oldest || l.offer.fetchedAt < oldest) oldest = l.offer.fetchedAt;
    if (priceAgeDays(l.offer.fetchedAt, today) > staleDays) stale++;
    const s = stores.get(l.offer.store) ?? { total: 0, lines: 0 };
    s.total += l.total; s.lines++;
    stores.set(l.offer.store, s);
  };
  const model = mergedModel(world, itemIds);
  if (model.panels.length || model.bars?.length) {
    const q = await buildQuote(model, providers);
    for (const l of q.lines) { lines.push(l); note(l); furniture += l.total; }
  }
  if (!itemIds) {
    for (const room of world.rooms) {
      if (!room.floor) continue;
      for (const l of await quoteFloor(room.name, room.floor, planFloor(room, room.floor), providers)) { lines.push(l); note(l); floors += l.total; }
    }
  }
  const round = (n: number) => Number(n.toFixed(2));
  return {
    currency: [...currencies][0] ?? "?",
    lines,
    subtotal: round(furniture + floors),
    missingCount: lines.filter((l) => l.missing).length,
    oldestPrice: oldest,
    groups: { furniture: round(furniture), floors: round(floors) },
    byStore: [...stores].map(([store, s]) => ({ store, total: round(s.total), lines: s.lines })).sort((a, b) => b.total - a.total),
    staleCount: stale,
    currencies: [...currencies],
  };
}
