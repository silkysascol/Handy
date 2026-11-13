import type { Millimeters } from "../model/index.js";

/** Unidad en la que se vende un producto. */
export type SaleUnit = "sheet" | "meter" | "unit" | "pack";

export interface ProductQuery {
  /** Categoría normalizada: "board", "edgeband", "hinge", "confirmat", ... */
  category: string;
  /** Texto libre adicional, p.ej. "melamina blanco". */
  text?: string;
  thickness?: Millimeters;
  finish?: string;
  /** Código de país ISO-3166 (CL, CO, AR, MX, ES, ...) o región de tienda. */
  region?: string;
  /** Id del herraje concreto, para proveedores que tienen precio por herraje y no solo por categoría. */
  itemId?: string;
}

export interface PriceOffer {
  sku: string;
  name: string;
  store: string;
  price: number;
  currency: string;
  unit: SaleUnit;
  /** Unidades por paquete cuando unit = "pack". */
  packSize?: number;
  url?: string;
  /** ISO 8601. Las cotizaciones muestran la antigüedad del precio. */
  fetchedAt: string;
  attributes?: Record<string, string | number | boolean | undefined>;
  stock?: "in-stock" | "low" | "out" | "unknown";
}

/**
 * Un proveedor de precios: catálogo estático, scraper de tienda local, API oficial,
 * lista pegada por el usuario, etc. Ver docs/modulos/cotizacion.md.
 */
export interface PriceProvider {
  id: string;
  name: string;
  region: string;
  /** Catálogo de muestra con precios ficticios: se deja de usar cuando el usuario tiene precios propios. */
  example?: boolean;
  search(query: ProductQuery): Promise<PriceOffer[]>;
}

/** Costo por unidad de conteo, para comparar ofertas por paquete con ofertas por unidad. */
export const unitCost = (o: PriceOffer): number => (o.unit === "pack" && o.packSize ? o.price / o.packSize : o.price);
