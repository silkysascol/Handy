import { buildQuote, type QuoteLine } from "./quote.js";
import { planFloor, quoteFloor } from "./flooring.js";
import type { PriceProvider } from "./providers/types.js";
import { mergedModel, type World } from "./world.js";

export interface WorldQuote {
  currency: string;
  lines: QuoteLine[];
  subtotal: number;
  missingCount: number;
  oldestPrice?: string;
  /** Subtotales por grupo: muebles y pisos. */
  groups: { furniture: number; floors: number };
}

/** Cotiza todo el mundo: muebles (tableros según plano de corte, cantos, herrajes) y pisos (cajas, pega, boquilla). */
export async function quoteWorld(world: World, providers: PriceProvider[], itemIds?: string[]): Promise<WorldQuote> {
  const lines: QuoteLine[] = [];
  let currency = "", oldest: string | undefined, furniture = 0, floors = 0;
  const note = (l: QuoteLine) => {
    if (!l.offer) return;
    currency ||= l.offer.currency;
    if (!oldest || l.offer.fetchedAt < oldest) oldest = l.offer.fetchedAt;
  };
  const model = mergedModel(world, itemIds);
  if (model.panels.length) {
    const q = await buildQuote(model, providers);
    for (const l of q.lines) { lines.push(l); note(l); furniture += l.total; }
  }
  if (!itemIds) {
    for (const room of world.rooms) {
      if (!room.floor) continue;
      for (const l of await quoteFloor(room.name, room.floor, planFloor(room, room.floor), providers)) { lines.push(l); note(l); floors += l.total; }
    }
  }
  return { currency: currency || "?", lines, subtotal: Number((furniture + floors).toFixed(2)), missingCount: lines.filter((l) => l.missing).length, oldestPrice: oldest, groups: { furniture: Number(furniture.toFixed(2)), floors: Number(floors.toFixed(2)) } };
}
