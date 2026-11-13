import type { PriceOffer, PriceProvider, ProductQuery, SaleUnit } from "./providers/types.js";

/**
 * Libro de precios propio: lo que el usuario (o su IA) vio en la tienda, con tienda, enlace y fecha.
 * Handy no consulta tiendas por su cuenta; quien busca es la IA del usuario, y aquí queda anotado.
 * Con el primer precio propio, el presupuesto deja de usar el catálogo de ejemplo.
 */
export type PriceAttrs = Record<string, string | number | boolean>;

/** Lo que un renglón del presupuesto necesita para tener precio. Con esto se crea una entrada que le sirve. */
export interface PriceNeed {
  category: string;
  /** Unidad en la que el presupuesto cuenta el renglón. */
  unit: SaleUnit;
  /** Id del herraje cuando el precio es de un herraje concreto y no de toda la categoría. */
  itemId?: string;
  attributes?: PriceAttrs;
}

export interface PriceEntry {
  id: string;
  category: string;
  name: string;
  store: string;
  price: number;
  unit: SaleUnit;
  /** Unidades (o metros) por paquete cuando unit = "pack". */
  packSize?: number;
  url?: string;
  /** Día en que se vio el precio (AAAA-MM-DD). */
  seenAt: string;
  itemId?: string;
  attributes?: PriceAttrs;
}

export interface PriceBook {
  version: 1;
  currency: string;
  entries: PriceEntry[];
  updatedAt?: string;
}

export const createPriceBook = (currency = "COP"): PriceBook => ({ version: 1, currency, entries: [] });

export function isPriceBook(x: unknown): x is PriceBook {
  const b = x as PriceBook;
  return !!b && b.version === 1 && typeof b.currency === "string" && Array.isArray(b.entries);
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const same = (a: unknown, b: unknown) => norm(String(a)) === norm(String(b));

/** Clave estable de una necesidad: la misma para renglones que se resuelven con el mismo precio. */
export function needKey(need: PriceNeed): string {
  const attrs = Object.entries(need.attributes ?? {}).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify([need.category, need.unit, need.itemId ?? "", attrs]);
}

export function parseNeedKey(key: string): PriceNeed {
  let raw: unknown;
  try { raw = JSON.parse(key); } catch { throw new Error("La clave del renglón no es válida. Usa la que entrega prices_needed, tal cual."); }
  if (!Array.isArray(raw) || typeof raw[0] !== "string" || !["sheet", "meter", "unit", "pack"].includes(raw[1] as string) || !Array.isArray(raw[3])) throw new Error("La clave del renglón no es válida. Usa la que entrega prices_needed, tal cual.");
  const attributes = Object.fromEntries(raw[3] as [string, string | number | boolean][]);
  return { category: raw[0], unit: raw[1] as SaleUnit, ...(raw[2] ? { itemId: String(raw[2]) } : {}), ...(Object.keys(attributes).length ? { attributes } : {}) };
}

/** Una entrada sirve a una necesidad si es de su categoría y nada de lo que la entrada especifica la contradice. */
export function entryServes(e: PriceEntry, need: PriceNeed): boolean {
  if (e.category !== need.category) return false;
  if (e.itemId && e.itemId !== need.itemId) return false;
  // "piecesPerBox" describe la presentación de la tienda, no el producto.
  return Object.entries(e.attributes ?? {}).every(([k, v]) => k === "piecesPerBox" || need.attributes?.[k] === undefined || same(need.attributes[k], v));
}

export interface PriceInput {
  name: string;
  store: string;
  price: number;
  /** Si la tienda lo vende por caja, rollo o paquete: cuántas unidades (o metros) trae. */
  packSize?: number;
  url?: string;
  seenAt: string;
}

/** Anota o actualiza el precio de una necesidad en una tienda. Devuelve la entrada. */
export function setPrice(book: PriceBook, need: PriceNeed, input: PriceInput): PriceEntry {
  if (!(input.price > 0) || !Number.isFinite(input.price)) throw new Error("El precio debe ser un número mayor que cero.");
  if (!/^\d{4}-\d{2}-\d{2}/.test(input.seenAt)) throw new Error("La fecha debe ser AAAA-MM-DD.");
  if (input.packSize !== undefined && !(input.packSize >= 1)) throw new Error("El contenido del paquete debe ser 1 o más.");
  const store = input.store.trim() || "Sin tienda";
  const key = needKey(need);
  const packed = input.packSize && input.packSize > 1 ? input.packSize : undefined;
  const attributes: PriceAttrs = { ...(need.attributes ?? {}) };
  // Las baldosas ya se cuentan por caja: lo que cambia es cuántas piezas trae la de esta tienda.
  const tileBox = need.unit === "pack";
  if (tileBox && packed) attributes.piecesPerBox = packed;
  const entry: PriceEntry = {
    id: "",
    category: need.category,
    name: input.name.trim() || need.category,
    store,
    price: input.price,
    unit: tileBox ? "pack" : packed ? "pack" : need.unit,
    ...(packed && !tileBox ? { packSize: packed } : {}),
    ...(input.url ? { url: input.url } : {}),
    seenAt: input.seenAt.slice(0, 10),
    ...(need.itemId ? { itemId: need.itemId } : {}),
    ...(Object.keys(attributes).length ? { attributes } : {}),
  };
  const sameNeed = (e: PriceEntry) => needKey({ category: e.category, unit: need.unit, itemId: e.itemId, attributes: stripBox(e.attributes) }) === key;
  const at = book.entries.findIndex((e) => sameNeed(e) && same(e.store, store));
  if (at >= 0) { entry.id = book.entries[at].id; book.entries[at] = entry; }
  else {
    const base = norm(`${need.itemId ?? need.category}-${store}`).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let id = base, n = 2;
    while (book.entries.some((e) => e.id === id)) id = `${base}-${n++}`;
    entry.id = id;
    book.entries.push(entry);
  }
  return entry;
}

function stripBox(a?: PriceAttrs): PriceAttrs | undefined {
  if (!a) return undefined;
  const { piecesPerBox: _box, ...rest } = a;
  return Object.keys(rest).length ? rest : undefined;
}

export function removePrice(book: PriceBook, id: string): PriceEntry {
  const at = book.entries.findIndex((e) => e.id === id);
  if (at < 0) throw new Error(`No hay ningún precio con id "${id}".`);
  return book.entries.splice(at, 1)[0];
}

/** El libro como proveedor de precios para la cotización. */
export class PriceBookProvider implements PriceProvider {
  readonly id = "mis-precios";
  readonly name = "Mis precios";
  readonly region = "";
  constructor(private readonly book: PriceBook) {}

  async search(query: ProductQuery): Promise<PriceOffer[]> {
    const text = query.text ? norm(query.text) : undefined;
    let found = this.book.entries
      .filter((e) => e.category === query.category)
      .filter((e) => !e.itemId || !query.itemId || e.itemId === query.itemId)
      .filter((e) => query.thickness == null || e.attributes?.thickness == null || Number(e.attributes.thickness) === query.thickness)
      .filter((e) => !query.finish || e.attributes?.finish == null || same(e.attributes.finish, query.finish))
      .filter((e) => !text || norm(e.name).includes(text));
    // Un precio anotado para ese herraje concreto vale más que uno genérico de su categoría.
    if (query.itemId && found.some((e) => e.itemId === query.itemId)) found = found.filter((e) => e.itemId === query.itemId);
    return found.map((e) => ({ sku: e.id, name: e.name, store: e.store, price: e.price, currency: this.book.currency, unit: e.unit, packSize: e.packSize, url: e.url, fetchedAt: e.seenAt, attributes: e.attributes }));
  }
}

/** Proveedores que usa la cotización: con precios propios, los catálogos de ejemplo se dejan de lado. */
export function activeProviders(book: PriceBook | undefined, others: PriceProvider[]): PriceProvider[] {
  if (!book?.entries.length) return others;
  return [new PriceBookProvider(book), ...others.filter((p) => !p.example)];
}

// ---------- Anotar precios escribiendo ----------

/** "185.000", "$ 4.500", "62,5", "185 mil", "1,2 millones". El punto o la coma seguidos de tres cifras son miles. */
export function parseMoney(raw: string): number | undefined {
  const m = norm(raw).match(/(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(millones|millon|mil|k)?/);
  if (!m) return undefined;
  const digits = /^\d{1,3}([.,]\d{3})+$/.test(m[1]) ? m[1].replace(/[.,]/g, "") : m[1].replace(",", ".");
  const value = Number(digits) * (m[2] ? (m[2].startsWith("millon") ? 1e6 : 1e3) : 1);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export const isPriceCommand = (text: string) => /\b(precio|precios|vale|valen|cuesta|cuestan)\b/.test(norm(text));

/** Palabras con las que la gente nombra cada categoría, para encontrar el renglón. */
const CATEGORY_WORDS: Record<string, string> = {
  board: "tablero lamina melamina madera mdf", edgeband: "canto tapacanto enchape", hinge: "bisagra", slide: "corredera riel", handle: "tirador manija manilla",
  "steel-profile": "tubo perfil acero barra", tile: "baldosa piso ceramica porcelanato", "tile-adhesive": "pega pegante adhesivo", grout: "boquilla fragua",
  "cam-lock": "minifix excentrica perno", dowel: "tarugo", confirmat: "confirmat tornillo", screw: "tornillo", "shelf-pin": "soporte repisa", foot: "pata niveladora",
  "closet-rod": "tubo colgar barra", "rod-support": "soporte tubo", "welding-rod": "soldadura electrodo", "paint-m2": "pintura anticorrosivo", "tube-cap": "regaton tapa",
};
const STOP = new Set(["precio", "precios", "vale", "valen", "cuesta", "cuestan", "de", "del", "la", "el", "los", "las", "a", "por", "un", "una", "cada", "unidad", "es", "en", "y", "para", "con", "quita", "borra", "elimina", "mm", "cm"]);
const UNIT_LABEL: Record<SaleUnit, string> = { sheet: "tablero", meter: "metro", unit: "unidad", pack: "caja" };

export interface PricedLine { description: string; category: string; need: PriceNeed }
export interface PriceCommandResult { ok: boolean; understood: boolean; message: string; entry?: PriceEntry }

/**
 * Anota un precio escribiendo: "precio melamina blanco 185.000 en Madecentro",
 * "la bisagra vale 4.500 en Homecenter", "precio tornillo fondo 12.000 caja de 100".
 * El renglón se busca entre los del presupuesto actual; "quita el precio de la bisagra" lo borra.
 */
export function runPriceCommand(book: PriceBook, lines: PricedLine[], text: string, today: string, format: (n: number) => string = (n) => `${book.currency} ${n.toLocaleString("es-CO")}`): PriceCommandResult {
  let t = norm(text).replace(/[¿?¡!]/g, " ");
  const removing = /\b(quita|borra|elimina)\b/.test(t);
  let packSize: number | undefined;
  t = t.replace(/\b(?:caja|paquete|bolsa|rollo|pack)\s+(?:de|x|por)\s+(\d+)\s*(?:unidades|unidad|und|piezas|metros|m)?\b/, (_m, n: string) => { packSize = Number(n); return " "; });
  let store = "";
  t = t.replace(/\ben\s+(?:el\s+|la\s+)?([a-z][a-z0-9 .&-]*?)\s*$/, (_m, s: string) => { store = s.trim(); return " "; });

  let price: number | undefined;
  if (!removing) {
    const tokens = [...t.matchAll(/\$?\s*(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(millones|millon|mil|k)?/g)].map((m) => {
      const end = m.index! + m[0].length, before = t.slice(0, m.index!), after = t.slice(end);
      // "18 mm", "60 x 60" o "40x40" son medidas, no plata.
      const measure = !m[2] && !m[0].includes("$") && !/[.,]\d{3}/.test(m[1]) && (/^\s*(mm|cm|m\b|kg|x\b|x\d)/.test(after) || /x\s*$/.test(before));
      return { at: m.index!, end, raw: m[0], measure };
    }).filter((k) => !k.measure);
    const kw = t.search(/\b(vale|valen|cuesta|cuestan)\b/);
    const pick = (kw >= 0 ? tokens.find((k) => k.at > kw) : undefined) ?? tokens[tokens.length - 1];
    if (!pick) return { ok: false, understood: true, message: 'No veo el valor. Escribe por ejemplo: "precio melamina blanco 185.000 en Madecentro".' };
    price = parseMoney(pick.raw);
    t = t.slice(0, pick.at) + " " + t.slice(pick.end);
  }
  // "40x40" se compara como "40 x 40"; las palabras repetidas cuentan una vez.
  const words = [...new Set(t.replace(/(\d)\s*x\s*(?=\d)/g, "$1 ").split(/[^a-z0-9]+/).filter((w) => w && w !== "x" && !STOP.has(w)))];
  if (!lines.length) return { ok: false, understood: true, message: "Aún no hay nada que cotizar: coloca un mueble o define un piso y luego anota sus precios." };
  if (!words.length) return { ok: false, understood: true, message: `Dime de qué es el precio. Renglones: ${[...new Set(lines.map((l) => l.description))].slice(0, 6).join("; ")}.` };

  const scored = lines.map((l) => {
    const hay = ` ${norm(`${l.description} ${CATEGORY_WORDS[l.category] ?? ""}`).replace(/[^a-z0-9]+/g, " ")} `;
    const stem = (w: string) => w.replace(/(es|s)$/, "");
    const hits = words.filter((w) => (/^\d+$/.test(w) || w.length < 4 ? hay.includes(` ${w} `) : hay.includes(stem(w)))).length;
    // Si el renglón se llama como lo nombró la persona ("tubo..."), gana a otro que solo lo menciona ("regatón para tubo").
    const head = norm(plainName(l)).split(/[^a-z0-9]+/)[0] ?? "";
    return { l, hits: hits + (words.some((w) => w.length >= 4 && head.startsWith(stem(w))) ? 0.5 : 0) };
  });
  const best = Math.max(...scored.map((s) => s.hits));
  if (best < 1) return { ok: false, understood: true, message: `No encuentro ese renglón en tu presupuesto. Renglones: ${[...new Set(lines.map((l) => l.description))].slice(0, 8).join("; ")}.` };
  const winners = new Map(scored.filter((s) => s.hits === best).map((s) => [needKey(s.l.need), s.l]));
  if (winners.size > 1) return { ok: false, understood: true, message: `Hay varios renglones que coinciden: ${[...winners.values()].slice(0, 5).map((l) => l.description).join("; ")}. Dilo con más detalle.` };
  const line = [...winners.values()][0];
  const name = plainName(line);

  if (removing) {
    const mine = book.entries.filter((e) => entryServes(e, line.need) && (!store || same(e.store, store)));
    if (!mine.length) return { ok: false, understood: true, message: `No tienes precio anotado para ${name}${store ? ` en ${titleCase(store)}` : ""}.` };
    book.entries = book.entries.filter((e) => !mine.includes(e));
    return { ok: true, understood: true, message: `Quité ${mine.length === 1 ? "el precio" : `${mine.length} precios`} de ${name}.` };
  }
  const first = book.entries.length === 0;
  const entry = setPrice(book, line.need, { name, store: store ? titleCase(store) : "Sin tienda", price: price!, packSize, seenAt: today });
  const per = entry.unit === "pack" ? `${line.need.unit === "pack" ? "caja" : "paquete"}${packSize ? ` de ${packSize}` : ""}` : UNIT_LABEL[entry.unit];
  return { ok: true, understood: true, entry, message: `Anotado: ${name} a ${format(entry.price)} por ${per}${store ? ` en ${entry.store}` : ""}.${first ? " Desde ahora el presupuesto usa solo tus precios; lo que no tenga precio sale como faltante." : ""}` };
}

/** Nombre del producto sin el nombre de la habitación ni la presentación de la tienda. */
const plainName = (l: PricedLine) => (["tile", "tile-adhesive", "grout"].includes(l.category) ? l.description.replace(/^.*? · /, "") : l.description).replace(/\s*\(caja de \d+\)$/, "");

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Días entre la fecha de un precio y hoy. */
export function priceAgeDays(seenAt: string, today: string): number {
  return Math.floor((Date.parse(today.slice(0, 10)) - Date.parse(seenAt.slice(0, 10))) / 86400000);
}
