import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addOpening,
  addRoom,
  activeProviders,
  assemblyHtml,
  attachRoom,
  buildAssemblyPlan,
  buildCutPlan,
  createPriceBook,
  drillSheets,
  isPriceBook,
  needKey,
  parseNeedKey,
  priceAgeDays,
  removePrice,
  setPrice,
  type PriceBook,
  cutlistCsv,
  cutSheetHtml,
  checkWorld,
  itemModel,
  planBars,
  createWorld,
  describeWorld,
  exportGltf,
  freeWallRuns,
  mergedModel,
  placeCabinet,
  planFloor,
  quoteWorld,
  removeItem,
  runCommand,
  updateItem,
  type Selection,
  WALL_NAMES,
  type PriceProvider,
  type World,
} from "@handy/core";

/** Dónde vive el mundo del usuario. Cambiable con HANDY_WORLD=/ruta/mi-casa.world.json */
export const defaultWorldPath = (): string => resolve(process.env.HANDY_WORLD ?? join(homedir(), ".handy", "mundo.world.json"));

export class WorldStore {
  constructor(readonly path: string = defaultWorldPath()) {}
  exists(): boolean { return existsSync(this.path); }
  load(): World {
    if (!this.exists()) throw new Error(`Aún no hay un mundo en ${this.path}. Crea uno con world_create.`);
    return JSON.parse(readFileSync(this.path, "utf8")) as World;
  }
  save(world: World): void {
    world.updatedAt = new Date().toISOString();
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(world, null, 2) + "\n");
  }
}

/** Dónde viven los precios propios: junto al mundo, o donde diga HANDY_PRICES. */
export class PriceStore {
  constructor(readonly path: string) {}
  static beside(world: WorldStore): PriceStore { return new PriceStore(resolve(process.env.HANDY_PRICES ?? join(dirname(world.path), "precios.json"))); }
  load(): PriceBook {
    if (!existsSync(this.path)) return createPriceBook();
    const book: unknown = JSON.parse(readFileSync(this.path, "utf8"));
    if (!isPriceBook(book)) throw new Error(`${this.path} no es un libro de precios de Handy.`);
    return book;
  }
  save(book: PriceBook): void {
    book.updatedAt = new Date().toISOString();
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(book, null, 2) + "\n");
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const UNIT: Record<string, string> = { sheet: "tablero", meter: "metro", unit: "unidad", pack: "caja" };

const wall = z.enum(["north", "east", "south", "west"]).describe("Muro: north, east, south o west");
const text = (t: string, structuredContent?: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: t }], ...(structuredContent ? { structuredContent } : {}) });

export function registerWorldTools(server: McpServer, providers: PriceProvider[], store: WorldStore = new WorldStore(), prices: PriceStore = PriceStore.beside(store)): void {
  server.registerTool(
    "world_create",
    {
      title: "Crear mundo",
      description: "Crea el mundo del usuario (el duplicado virtual de su casa o taller). Falla si ya existe uno, salvo que overwrite sea true. Úsalo solo si el usuario lo pide.",
      inputSchema: { name: z.string().describe('Nombre, p.ej. "Mi casa"'), overwrite: z.boolean().default(false) },
    },
    async ({ name, overwrite }) => {
      if (store.exists() && !overwrite) throw new Error(`Ya existe un mundo en ${store.path}. Usa world_describe para verlo, o overwrite: true si el usuario confirmó reemplazarlo.`);
      const world = createWorld(name);
      store.save(world);
      return text(`Mundo "${name}" creado en ${store.path}. Agrega habitaciones con world_add_room.`);
    },
  );

  server.registerTool(
    "world_describe",
    {
      title: "Describir el mundo",
      description: "Devuelve el estado actual del mundo en texto: habitaciones con medidas y muros, aberturas, muebles colocados y tramos libres de cada muro. Llámala antes de proponer o colocar algo.",
      inputSchema: {},
    },
    async () => {
      const world = store.load();
      return text(describeWorld(world), { world });
    },
  );

  server.registerTool(
    "world_add_room",
    {
      title: "Agregar habitación",
      description: "Agrega una habitación rectangular, suelta o pegada a otra con attachTo y side (comparten muro). width es el largo de los muros norte y sur (eje X), depth el de este y oeste (eje Z). origin ubica la esquina interior noroeste en el plano de la casa. Medidas en mm.",
      inputSchema: {
        name: z.string(),
        width: z.number().int().min(500).max(30000),
        depth: z.number().int().min(500).max(30000),
        height: z.number().int().min(1800).max(6000).default(2400),
        wallThickness: z.number().int().min(50).max(600).default(150).describe("Grosor de los cuatro muros; luego se puede afinar por muro"),
        originX: z.number().int().default(0),
        originZ: z.number().int().default(0),
        attachTo: z.string().optional().describe("Id de una habitación existente a la que se pega la nueva, compartiendo muro. Si viene, se ignoran originX y originZ."),
        side: wall.optional().describe("Con attachTo: lado de la habitación existente donde queda la nueva"),
        shift: z.number().int().default(0).describe("Con attachTo: desplazamiento a lo largo del muro compartido, desde su extremo oeste o norte"),
      },
    },
    async ({ name, width, depth, height, wallThickness, originX, originZ, attachTo, side, shift }) => {
      const world = store.load();
      if (attachTo && !side) throw new Error("Con attachTo indica también side (north, east, south o west).");
      const room = attachTo ? attachRoom(world, { name, width, depth, height, wallThickness, to: attachTo, side: side!, shift }) : addRoom(world, { name, width, depth, height, wallThickness, origin: [originX, originZ] });
      store.save(world);
      return text(`Habitación "${room.name}" (id: ${room.id}) agregada: ${width} x ${depth} x ${height} mm${attachTo ? `, pegada al ${WALL_NAMES[side!]} de ${attachTo}; las puertas entre las dos se ponen en ese muro` : ""}.`, { room });
    },
  );

  server.registerTool(
    "world_add_opening",
    {
      title: "Agregar puerta, ventana o paso",
      description: "Agrega una abertura a un muro. offset es la distancia en mm desde el extremo izquierdo del muro mirándolo desde dentro de la habitación.",
      inputSchema: {
        roomId: z.string(),
        wall,
        type: z.enum(["door", "window", "pass"]),
        offset: z.number().int().min(0),
        width: z.number().int().min(300).max(6000),
        height: z.number().int().min(300).max(4000),
        sill: z.number().int().min(0).optional().describe("Altura del antepecho; por defecto 1000 en ventanas y 0 en puertas"),
      },
    },
    async ({ roomId, ...input }) => {
      const world = store.load();
      const opening = addOpening(world, roomId, input);
      store.save(world);
      return text(`Abertura ${opening.id} agregada en el ${WALL_NAMES[opening.wall]}.`, { opening });
    },
  );

  server.registerTool(
    "world_free_runs",
    {
      title: "Tramos libres de muro",
      description: "Lista los tramos de muro donde cabe un mueble de cierta altura, descontando puertas, ventanas que taparía y muebles existentes. Úsala para decidir dónde y de qué ancho puede ir un mueble.",
      inputSchema: {
        roomId: z.string(),
        height: z.number().int().default(900).describe("Alto del mueble a ubicar"),
        elevation: z.number().int().default(0).describe("Altura sobre el piso (muebles colgados)"),
        minLength: z.number().int().default(300),
      },
    },
    async ({ roomId, height, elevation, minLength }) => {
      const runs = freeWallRuns(store.load(), roomId, { height, elevation, minLength });
      return text(runs.map((r) => `${WALL_NAMES[r.wall]}: ${r.from}–${r.to} (${r.length} mm)`).join("\n") || "No hay tramos libres con esas condiciones.", { runs });
    },
  );

  server.registerTool(
    "world_place_cabinet",
    {
      title: "Colocar gabinete",
      description: "Coloca un gabinete con la espalda contra un muro. Devuelve los avisos del mundo tras colocarlo (colisiones al abrir, aberturas tapadas, solapes). Si hay errores, corrige con world_remove_item y vuelve a colocar.",
      inputSchema: {
        roomId: z.string(),
        wall,
        offset: z.number().int().min(0).describe("Distancia en mm desde el extremo izquierdo del muro mirándolo desde dentro"),
        elevation: z.number().int().min(0).default(0).describe("0 = apoyado en el piso; p.ej. 1500 para un mueble alto de cocina"),
        name: z.string().optional(),
        width: z.number().int().min(100).max(3000),
        height: z.number().int().min(100).max(3000),
        depth: z.number().int().min(100).max(1000),
        shelves: z.number().int().min(0).max(20).default(0),
        doors: z.number().int().min(0).max(8).default(0).describe("Más de 2 exige 2 por cuerpo"),
        dividers: z.number().int().min(0).max(8).default(0).describe("Divisiones verticales: dividers + 1 cuerpos iguales"),
        drawers: z.number().int().min(0).max(10).default(0).describe("Cajones con corredera, abajo en el primer cuerpo"),
        drawerHeight: z.number().int().min(100).max(400).default(200),
        hangingBar: z.boolean().default(false).describe("Barra de colgar con maletero (closet)"),
        plinthHeight: z.number().int().min(0).max(200).default(0),
        joinery: z.enum(["confirmat", "minifix", "dowel", "pocket-screw"]).default("minifix").describe("minifix o dowel = sin tornillos a la vista"),
        boardThickness: z.number().int().min(12).max(30).default(18),
      },
    },
    async ({ roomId, wall: w, offset, elevation, name, ...params }) => {
      const world = store.load();
      const item = placeCabinet(world, { roomId, wall: w, offset, elevation, name, params });
      store.save(world);
      const issues = checkWorld(world).filter((i) => i.itemId === item.id);
      return text(
        [`${item.name} (id: ${item.id}) colocado en el ${WALL_NAMES[item.wall]} de ${offset} a ${offset + params.width} mm.`, ...issues.map((i) => `[${i.level}] ${i.message}`)].join("\n"),
        { item, issues },
      );
    },
  );

  server.registerTool(
    "world_place_frame",
    {
      title: "Colocar estructura de tubo",
      description: "Coloca una estructura de tubo cuadrado de acero contra un muro: una mesa o base (4 patas, marco superior e inferior, cubierta opcional) o una estantería (4 parales, un marco y un entrepaño por nivel). Calcula barras de 6 m, peso y uniones.",
      inputSchema: {
        roomId: z.string(),
        wall,
        offset: z.number().int().min(0),
        name: z.string().optional(),
        type: z.enum(["table", "shelving"]).describe("table = mesa o base; shelving = estantería"),
        width: z.number().int().min(100).max(6000),
        height: z.number().int().min(200).max(3000),
        depth: z.number().int().min(100).max(2000),
        profileId: z.enum(["tubo-20x20x1.2", "tubo-25x25x1.5", "tubo-30x30x1.5", "tubo-40x40x1.5", "tubo-50x50x2"]).default("tubo-40x40x1.5"),
        levels: z.number().int().min(2).max(8).default(4).describe("Solo estantería"),
        top: z.boolean().default(true).describe("Cubierta o entrepaños de tablero"),
        joint: z.enum(["weld", "bolt"]).default("weld").describe("weld = soldada; bolt = atornillada con conectores, para quien no suelda"),
      },
    },
    async ({ roomId, wall: w, offset, name, type, width, height, depth, profileId, levels, top, joint }) => {
      const world = store.load();
      const item = placeCabinet(world, { roomId, wall: w, offset, name, params: { width, height, depth }, frame: { type, profileId, top, joint, ...(type === "shelving" ? { levels } : {}) } });
      store.save(world);
      const issues = checkWorld(world).filter((i) => i.itemId === item.id);
      const plan = planBars(itemModel(item).bars ?? []);
      return text(
        [`${item.name} (id: ${item.id}) colocada en el ${WALL_NAMES[item.wall]} de ${offset} a ${offset + width} mm.`, ...plan.totals.map((t) => `${t.bars} barra(s) de 6 m de ${t.profileName}: ${t.meters} m, ${t.kg} kg, sobra ${t.wastePct} %.`), ...issues.map((i) => `[${i.level}] ${i.message}`)].join("\n"),
        { item, issues, bars: plan.totals },
      );
    },
  );

  server.registerTool(
    "world_remove_item",
    { title: "Quitar mueble", description: "Quita un mueble del mundo por su id.", inputSchema: { itemId: z.string() } },
    async ({ itemId }) => {
      const world = store.load();
      if (!removeItem(world, itemId)) throw new Error(`No existe el mueble "${itemId}".`);
      store.save(world);
      return text(`Mueble ${itemId} quitado.`);
    },
  );

  server.registerTool(
    "world_update_item",
    {
      title: "Modificar mueble",
      description: "Cambia medidas, posición o partes de un mueble ya colocado. Solo envía los campos que cambian. Si el resultado no cabe, no cambia nada y explica por qué.",
      inputSchema: {
        itemId: z.string(),
        name: z.string().optional(),
        wall: wall.optional(),
        offset: z.number().int().min(0).optional(),
        elevation: z.number().int().min(0).optional(),
        width: z.number().int().min(100).max(3000).optional(),
        height: z.number().int().min(100).max(3000).optional(),
        depth: z.number().int().min(100).max(1000).optional(),
        shelves: z.number().int().min(0).max(20).optional(),
        doors: z.number().int().min(0).max(8).optional(),
        dividers: z.number().int().min(0).max(8).optional(),
        drawers: z.number().int().min(0).max(10).optional(),
        drawerHeight: z.number().int().min(100).max(400).optional(),
        hangingBar: z.boolean().optional(),
        plinthHeight: z.number().int().min(0).max(200).optional(),
        joinery: z.enum(["confirmat", "minifix", "dowel", "pocket-screw"]).optional(),
      },
    },
    async ({ itemId, name, wall: w, offset, elevation, ...params }) => {
      const world = store.load();
      const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
      const item = updateItem(world, itemId, { ...(name !== undefined ? { name } : {}), ...(w ? { wall: w } : {}), ...(offset !== undefined ? { offset } : {}), ...(elevation !== undefined ? { elevation } : {}), params: clean });
      store.save(world);
      const issues = checkWorld(world).filter((i) => i.itemId === item.id);
      return text([`${item.name}: ${item.params.width} x ${item.params.height} x ${item.params.depth} mm, en el ${WALL_NAMES[item.wall]} de ${item.offset} a ${item.offset + item.params.width}.`, ...issues.map((i) => `[${i.level}] ${i.message}`)].join("\n"), { item, issues });
    },
  );

  server.registerTool(
    "world_command",
    {
      title: "Orden en lenguaje natural sobre una selección",
      description: 'Aplica una orden corta en español sobre lo seleccionado, igual que la barra de comandos del visor: "pon una puerta de 80 x 205 a 2 m de la izquierda" (muro), "ensancha 10 cm" (mueble), "muévela 20 cm a la derecha" (abertura), "cocina de 2,8 x 2,4 m" (sin selección). Para la selección envía roomId + wall, o itemId, o roomId + openingId, o solo roomId, o nada.',
      inputSchema: { text: z.string(), roomId: z.string().optional(), wall: wall.optional(), itemId: z.string().optional(), openingId: z.string().optional() },
    },
    async ({ text: order, roomId, wall: w, itemId, openingId }) => {
      const selection: Selection = itemId ? { kind: "item", itemId } : roomId && openingId ? { kind: "opening", roomId, openingId } : roomId && w ? { kind: "wall", roomId, wall: w } : roomId ? { kind: "room", roomId } : { kind: "world" };
      const world = store.load();
      const result = runCommand(world, selection, order);
      if (result.ok) store.save(world);
      return { ...text(result.message, { ...result }), isError: !result.ok };
    },
  );

  server.registerTool(
    "world_check",
    {
      title: "Revisar el mundo",
      description: "Revisa todo: solapes entre muebles, puertas y ventanas tapadas, colisiones al abrir puertas contra muros y otros muebles, y reglas constructivas de cada mueble.",
      inputSchema: {},
    },
    async () => {
      const issues = checkWorld(store.load());
      return text(issues.map((i) => `[${i.level}] ${i.message}`).join("\n") || "Sin avisos: todo cabe y abre sin chocar.", { issues });
    },
  );

  server.registerTool(
    "world_quote",
    {
      title: "Cotizar el mundo",
      description: "Cotiza todo el mundo: muebles (tableros según plano de corte, tapacanto, herrajes, perfiles) y pisos (cajas, pega, boquilla), o solo los muebles indicados. Usa los precios propios del usuario si existen (prices_needed, price_set); si no, un catálogo de ejemplo con precios ficticios. Nunca inventes ni ajustes precios: lo que falte, búscalo y anótalo.",
      inputSchema: { itemIds: z.array(z.string()).optional() },
    },
    async ({ itemIds }) => {
      const world = store.load();
      const book = prices.load();
      const quote = await quoteWorld(world, activeProviders(book, providers), itemIds, { today: today() });
      const lines = quote.lines.map((l) => `${l.description}: ${l.qty} ${l.unit} x ${l.unitPrice} = ${Number(l.total.toFixed(2))}${l.missing ? " (SIN PRECIO)" : ""}${l.offer ? ` · ${l.offer.store} · ${l.offer.fetchedAt}` : ""}`);
      const source = book.entries.length ? "precios propios del usuario" : "CATÁLOGO DE EJEMPLO, precios ficticios: sirve para comparar opciones, no para comprar";
      const stores = book.entries.length && quote.byStore.length > 1 ? [`Por tienda: ${quote.byStore.map((s) => `${s.store} ${s.total}`).join(" · ")}`] : [];
      return text(
        [`Cotización: ${quote.subtotal} ${quote.currency} (muebles ${quote.groups.furniture}, pisos ${quote.groups.floors})${quote.missingCount ? ` · INCOMPLETA: ${quote.missingCount} ítems sin precio` : ""} · ${source}${quote.staleCount ? ` · ${quote.staleCount} precios con más de 30 días` : ""}`, ...lines, ...stores].join("\n"),
        { currency: quote.currency, subtotal: quote.subtotal, groups: quote.groups, missingCount: quote.missingCount, staleCount: quote.staleCount, byStore: quote.byStore, ownPrices: book.entries.length > 0, lines: quote.lines },
      );
    },
  );

  server.registerTool(
    "prices_needed",
    {
      title: "Qué precios hacen falta",
      description: "Lista los renglones del presupuesto del mundo con lo que hay que comprar, su clave (key) y el precio que tienen hoy: tienda, fecha y si está viejo. Úsala antes de buscar precios: busca cada renglón en las tiendas del usuario (por ejemplo Homecenter y Madecentro) con tus propias herramientas de búsqueda y anota lo que encuentres con price_set, pasando la key tal cual.",
      inputSchema: { onlyMissing: z.boolean().default(false).describe("true = solo los que no tienen precio propio o lo tienen viejo") },
    },
    async ({ onlyMissing }) => {
      const world = store.load();
      const book = prices.load();
      const quote = await quoteWorld(world, activeProviders(book, providers), undefined, { today: today() });
      const seen = new Map<string, { key: string; description: string; category: string; qty: number; countedBy: string; status: string; store?: string; price?: number; seenAt?: string; ageDays?: number; url?: string }>();
      for (const l of quote.lines) {
        const key = needKey(l.need);
        const own = !!l.offer && book.entries.some((e) => e.id === l.offer!.sku);
        const age = own ? priceAgeDays(l.offer!.fetchedAt, today()) : undefined;
        const status = !own ? "falta" : age! > 30 ? "viejo" : "al día";
        const prev = seen.get(key);
        if (prev) { prev.qty += l.qty; continue; }
        seen.set(key, { key, description: l.description, category: l.category, qty: l.qty, countedBy: UNIT[l.need.unit], status, ...(own ? { store: l.offer!.store, price: l.offer!.price, seenAt: l.offer!.fetchedAt, ageDays: age, url: l.offer!.url } : {}) });
      }
      const all = [...seen.values()];
      const rows = onlyMissing ? all.filter((r) => r.status !== "al día") : all;
      const pending = all.filter((r) => r.status !== "al día").length;
      return text(
        [`${all.length} renglones; ${pending} sin precio propio al día. Moneda del libro: ${book.currency}.`, ...rows.map((r) => `[${r.status}] ${r.description} · se cuenta por ${r.countedBy}${r.store ? ` · ${r.price} en ${r.store} (${r.seenAt})` : ""}\n  key: ${r.key}`), "Anota cada precio con price_set { key, name, store, price, url }. Si la tienda lo vende por caja, rollo o paquete, pasa packSize con lo que trae."].join("\n"),
        { currency: book.currency, pending, rows },
      );
    },
  );

  server.registerTool(
    "price_set",
    {
      title: "Anotar un precio visto en una tienda",
      description: "Guarda en el libro de precios del usuario el precio de un renglón, tal como se vio en la tienda: nombre del producto, tienda, valor, enlace y fecha. La key sale de prices_needed. Anota solo precios que hayas visto de verdad en la página de la tienda o que el usuario te haya dado; nunca estimados. Con el primer precio propio, el presupuesto deja de usar el catálogo de ejemplo.",
      inputSchema: {
        key: z.string().describe("Clave del renglón, copiada de prices_needed"),
        name: z.string().describe("Nombre del producto como aparece en la tienda"),
        store: z.string().describe("Tienda: Homecenter, Madecentro, ferretería del barrio..."),
        price: z.number().positive().describe("Precio de la presentación que vende la tienda, en la moneda del libro, sin separadores"),
        packSize: z.number().positive().optional().describe("Si se vende por caja, rollo o paquete: cuántas unidades, piezas o metros trae"),
        url: z.string().url().optional().describe("Enlace al producto"),
        seenAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Día en que se vio el precio (AAAA-MM-DD). Por defecto, hoy"),
        currency: z.string().length(3).optional().describe("Moneda del libro (por defecto COP). Solo se puede cambiar mientras el libro está vacío"),
      },
    },
    async ({ key, name, store: shop, price, packSize, url, seenAt, currency }) => {
      const book = prices.load();
      if (currency && currency.toUpperCase() !== book.currency) {
        if (book.entries.length) throw new Error(`El libro ya tiene precios en ${book.currency}; no se mezclan monedas.`);
        book.currency = currency.toUpperCase();
      }
      const need = parseNeedKey(key);
      const entry = setPrice(book, need, { name, store: shop, price, packSize, url, seenAt: seenAt ?? today() });
      prices.save(book);
      const per = entry.unit === "pack" ? `${need.unit === "pack" ? "caja" : "paquete"}${packSize ? ` de ${packSize}` : ""}` : UNIT[entry.unit];
      return text(`Anotado: ${entry.name} a ${entry.price} ${book.currency} por ${per} en ${entry.store} (${entry.seenAt}). Guardado en ${prices.path}.`, { entry, path: prices.path });
    },
  );

  server.registerTool(
    "price_list",
    { title: "Ver los precios anotados", description: "Todos los precios propios del usuario: producto, tienda, valor, presentación, fecha y enlace.", inputSchema: {} },
    async () => {
      const book = prices.load();
      if (!book.entries.length) return text(`Aún no hay precios propios en ${prices.path}. El presupuesto usa el catálogo de ejemplo.`, { currency: book.currency, entries: [] });
      return text([`${book.entries.length} precios en ${book.currency}:`, ...book.entries.map((e) => `${e.id}: ${e.name} · ${e.price} por ${e.unit === "pack" ? `paquete${e.packSize ? ` de ${e.packSize}` : ""}` : UNIT[e.unit]} · ${e.store} · ${e.seenAt}${priceAgeDays(e.seenAt, today()) > 30 ? " (viejo)" : ""}${e.url ? ` · ${e.url}` : ""}`)].join("\n"), { currency: book.currency, entries: book.entries });
    },
  );

  server.registerTool(
    "price_remove",
    { title: "Borrar un precio anotado", description: "Quita un precio del libro del usuario por su id (ver price_list).", inputSchema: { id: z.string() } },
    async ({ id }) => {
      const book = prices.load();
      const gone = removePrice(book, id);
      prices.save(book);
      return text(`Quité el precio de ${gone.name} en ${gone.store}.${book.entries.length ? "" : " Ya no quedan precios propios: el presupuesto vuelve al catálogo de ejemplo."}`, { removed: gone });
    },
  );

  server.registerTool(
    "world_floor_plan",
    {
      title: "Plan de piso de una habitación",
      description: 'Devuelve el cálculo del piso definido en una habitación: piezas enteras y cortes, cajas, pega (tipo, kilos, sacos), boquilla, guardaescobas y avisos. El piso se define o cambia con world_command sobre la habitación: "piso de porcelanato 60 x 60", "trabado a un tercio", "junta 3", "quita el piso".',
      inputSchema: { roomId: z.string() },
    },
    async ({ roomId }) => {
      const room = store.load().rooms.find((r) => r.id === roomId);
      if (!room) throw new Error(`No existe la habitación "${roomId}".`);
      if (!room.floor) throw new Error(`${room.name} no tiene piso definido. Usa world_command con roomId y una orden como "piso de porcelanato 60 x 60".`);
      const { tiles, ...plan } = planFloor(room, room.floor);
      return text(
        [`${room.name}: ${plan.areaM2} m², ${plan.fullTiles} piezas enteras y ${plan.cutTiles} cortes.`, `Comprar ${plan.tilesToBuy} piezas (${plan.reservePct} % de reserva incluida): ${room.floor.piecesPerBox ? `${plan.boxes} caja(s) de ${plan.piecesPerBox}` : `unas ${plan.boxes} cajas si traen ${plan.piecesPerBox} piezas; world_quote calcula las cajas con la presentación real de la tienda`}.`, `Pega ${plan.adhesive.type}: ${plan.adhesive.kg} kg en ${plan.adhesive.bags25} saco(s) de 25 kg, ${plan.adhesive.trowel}.`, `Boquilla: ${plan.grout.kg} kg en ${plan.grout.bags2} bolsa(s) de 2 kg. Guardaescobas: ${plan.skirtingM} m.`, ...plan.notes].join("\n"),
        { spec: room.floor, plan, tileCount: tiles.length },
      );
    },
  );

  server.registerTool(
    "world_assembly",
    {
      title: "Instrucciones de armado",
      description: "Pasos para armar un mueble del mundo, en orden: qué piezas entran en cada paso, con qué herrajes y herramientas, dónde va cada herraje (con medidas) y qué comprobar. Tres niveles: guided (una pieza por paso, cada acción escrita; para quien nunca ha armado), normal y expert (solo orden y cantidades). Escribe además un manual imprimible (HTML) con un dibujo por paso y el plano de perforación de cada pieza. En el visor, el botón Armado lo muestra en 3D paso a paso.",
      inputSchema: { itemId: z.string(), level: z.enum(["guided", "normal", "expert"]).default("normal").describe("Nivel de detalle") },
    },
    async ({ itemId, level }) => {
      const world = store.load();
      const item = world.items.find((i) => i.id === itemId);
      if (!item) throw new Error(`No hay ningún mueble con id "${itemId}". Muebles: ${world.items.map((i) => i.id).join(", ") || "ninguno"}.`);
      const model = itemModel(item);
      const plan = buildAssemblyPlan(model, level);
      const base = store.path.replace(/(\.world)?\.json$/, "");
      mkdirSync(dirname(base), { recursive: true });
      const html = `${base}-armado-${item.id}-${level}.html`;
      writeFileSync(html, assemblyHtml(model, item.name, level));
      const letter = new Map(plan.parts.map((p) => [p.id, p.letter]));
      const lines = plan.steps.map((s) => [`${s.n}. ${s.title}${s.partIds.length ? ` [${s.partIds.map((id) => letter.get(id)).join(", ")}]` : ""}. ${s.text}${s.hardware.length ? ` Herrajes: ${s.hardware.map((h) => `${h.qty} × ${h.name}`).join("; ")}.` : ""}`, ...s.actions.map((a, i) => `   ${String.fromCharCode(97 + (i % 26))}) ${a}`), ...s.checks.map((c) => `   Comprobar: ${c}`)].join("\n"));
      const parts = plan.parts.map((p) => `${p.letter} ${p.name} × ${p.qty} (${p.size})`).join("; ");
      return text([`Armado de ${item.name}: ${plan.steps.length} pasos, unos ${plan.minutes} min. Nivel ${level}.`, `Piezas: ${parts}.`, `Herramientas: ${plan.tools.join(", ") || "ninguna especial"}.`, ...lines, `Manual imprimible en ${html}`].join("\n"), { ...plan, html });
    },
  );

  server.registerTool(
    "world_drilling",
    {
      title: "Plano de perforación",
      description: "Dónde va cada perforación de un mueble de tablero, pieza por pieza: qué herraje, diámetro, profundidad, en qué cara o canto y a qué distancia de cada borde. Sirve para pedir las piezas perforadas en la tienda o para marcar en casa. Sale de las mismas uniones con las que se cuentan los herrajes.",
      inputSchema: { itemId: z.string() },
    },
    async ({ itemId }) => {
      const world = store.load();
      const item = world.items.find((i) => i.id === itemId);
      if (!item) throw new Error(`No hay ningún mueble con id "${itemId}". Muebles: ${world.items.map((i) => i.id).join(", ") || "ninguno"}.`);
      const model = itemModel(item);
      if (model.bars?.length) throw new Error(`${item.name} es una estructura de tubo: no lleva plano de perforación de tableros.`);
      const sheets = drillSheets(model);
      return text([`Perforaciones de ${item.name} (unión ${model.joinery}): ${sheets.length} planos.`, ...sheets.map((d) => [`${d.name}${d.copies > 1 ? ` × ${d.copies} iguales` : ""} · cara de ${d.width} x ${d.height} mm`, ...d.lines.map((l) => `  ${l}`)].join("\n"))].join("\n"), { sheets: sheets.map(({ marks, ...rest }) => ({ ...rest, holes: marks.length })) });
    },
  );

  server.registerTool(
    "world_cutplan",
    {
      title: "Despiece y plano de corte",
      description: "Acomoda todas las piezas de los muebles en tableros enteros (con ancho de disco y refilado), dice cuántos tableros comprar y escribe el despiece para la tienda: un HTML imprimible con lista de piezas, cantos y plano de corte, y un CSV.",
      inputSchema: { itemIds: z.array(z.string()).optional(), kerf: z.number().int().min(0).max(10).default(3), trim: z.number().int().min(0).max(50).default(10) },
    },
    async ({ itemIds, kerf, trim }) => {
      const world = store.load();
      const model = mergedModel(world, itemIds);
      if (!model.panels.length && !model.bars?.length) throw new Error("No hay muebles que cortar.");
      const plan = buildCutPlan(model, { kerf, trim });
      const base = store.path.replace(/(\.world)?\.json$/, "");
      mkdirSync(dirname(base), { recursive: true });
      writeFileSync(`${base}-despiece.html`, cutSheetHtml(model, world.name, { kerf, trim }));
      writeFileSync(`${base}-despiece.csv`, cutlistCsv(model));
      const lines = plan.totals.map((t) => `${t.sheets} tablero(s) de ${t.materialName} · ocupación ${t.usedPct} %`);
      for (const t of planBars(model.bars ?? []).totals) lines.push(`${t.bars} barra(s) de 6 m de ${t.profileName} · ${t.kg} kg · sobra ${t.wastePct} %`);
      if (plan.oversize.length) lines.push(`NO CABEN en un tablero: ${plan.oversize.map((o) => `${o.name} (${o.height} x ${o.width})`).join(", ")}`);
      return text([...lines, `Despiece en ${base}-despiece.html y ${base}-despiece.csv`].join("\n"), { totals: plan.totals, oversize: plan.oversize, sheets: plan.sheets.length, html: `${base}-despiece.html`, csv: `${base}-despiece.csv` });
    },
  );

  server.registerTool(
    "world_export_gltf",
    {
      title: "Exportar a Blender (glTF)",
      description: "Escribe el mundo completo como archivo .gltf (metros, Y arriba, nodos con nombre por habitación, muro y pieza) para abrirlo en Blender con File > Import > glTF 2.0.",
      inputSchema: { path: z.string().optional().describe("Ruta de salida; por defecto junto al archivo del mundo") },
    },
    async ({ path }) => {
      const world = store.load();
      const out = resolve(path ?? store.path.replace(/(\.world)?\.json$/, "") + ".gltf");
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, exportGltf(world));
      return text(`Exportado a ${out}. En Blender: File > Import > glTF 2.0.`, { path: out });
    },
  );
}
