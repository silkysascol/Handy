import type { PriceOffer, PriceProvider, ProductQuery } from "./types.js";

export interface StaticCatalogEntry extends Omit<PriceOffer, "fetchedAt" | "store"> {
  category: string;
  store?: string;
}

export interface StaticCatalog {
  id: string;
  name: string;
  region: string;
  currency: string;
  updatedAt: string;
  /** Precios de muestra, no reales. */
  example?: boolean;
  items: StaticCatalogEntry[];
}

/**
 * Proveedor basado en un JSON local. Es el punto de partida para cualquier región:
 * el usuario (o la comunidad) mantiene su propia lista de precios.
 */
export class StaticCatalogProvider implements PriceProvider {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  readonly example?: boolean;

  constructor(private readonly catalog: StaticCatalog) {
    this.example = catalog.example;
    this.id = catalog.id;
    this.name = catalog.name;
    this.region = catalog.region;
  }

  async search(query: ProductQuery): Promise<PriceOffer[]> {
    const text = query.text?.toLowerCase();
    return this.catalog.items
      .filter((item) => item.category === query.category)
      .filter((item) => query.thickness == null || item.attributes?.thickness == null || item.attributes.thickness === query.thickness)
      .filter((item) => !query.finish || !item.attributes?.finish || String(item.attributes.finish).toLowerCase() === query.finish.toLowerCase())
      .filter((item) => !text || item.name.toLowerCase().includes(text))
      .map((item) => ({
        ...item,
        store: item.store ?? this.name,
        currency: item.currency ?? this.catalog.currency,
        fetchedAt: this.catalog.updatedAt,
      }))
      .sort((a, b) => a.price - b.price);
  }
}
