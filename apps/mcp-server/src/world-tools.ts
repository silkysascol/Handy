import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addOpening,
  addRoom,
  buildCutPlan,
  buildQuote,
  cutlistCsv,
  cutSheetHtml,
  checkWorld,
  createWorld,
  describeWorld,
  exportGltf,
  freeWallRuns,
  mergedModel,
  placeCabinet,
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

const wall = z.enum(["north", "east", "south", "west"]).describe("Muro: north, east, south o west");
const text = (t: string, structuredContent?: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: t }], ...(structuredContent ? { structuredContent } : {}) });

export function registerWorldTools(server: McpServer, providers: PriceProvider[], store: WorldStore = new WorldStore()): void {
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
      description: "Agrega una habitación rectangular. width es el largo de los muros norte y sur (eje X), depth el de este y oeste (eje Z). origin ubica la esquina interior noroeste en el plano de la casa. Medidas en mm.",
      inputSchema: {
        name: z.string(),
        width: z.number().int().min(500).max(30000),
        depth: z.number().int().min(500).max(30000),
        height: z.number().int().min(1800).max(6000).default(2400),
        wallThickness: z.number().int().min(50).max(600).default(150).describe("Grosor de los cuatro muros; luego se puede afinar por muro"),
        originX: z.number().int().default(0),
        originZ: z.number().int().default(0),
      },
    },
    async ({ name, width, depth, height, wallThickness, originX, originZ }) => {
      const world = store.load();
      const room = addRoom(world, { name, width, depth, height, wallThickness, origin: [originX, originZ] });
      store.save(world);
      return text(`Habitación "${room.name}" (id: ${room.id}) agregada: ${width} x ${depth} x ${height} mm.`, { room });
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
        doors: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
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
        doors: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
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
      description: "Cotiza de forma consolidada todos los muebles del mundo (o los indicados): tableros enteros, tapacanto y herrajes con el catálogo configurado. Los precios vienen del catálogo; nunca los inventes ni los ajustes.",
      inputSchema: { itemIds: z.array(z.string()).optional() },
    },
    async ({ itemIds }) => {
      const world = store.load();
      const quote = await buildQuote(mergedModel(world, itemIds), providers);
      const lines = quote.lines.map((l) => `${l.description}: ${l.qty} ${l.unit} x ${l.unitPrice} = ${Number(l.total.toFixed(2))}${l.missing ? " (SIN PRECIO)" : ""}${l.offer ? ` · ${l.offer.store} · ${l.offer.fetchedAt}` : ""}`);
      return text(
        [`Cotización de ${itemIds?.length ?? world.items.length} mueble(s): ${quote.subtotal} ${quote.currency}${quote.missingCount ? ` · INCOMPLETA: ${quote.missingCount} ítems sin precio` : ""}`, ...lines].join("\n"),
        { currency: quote.currency, subtotal: quote.subtotal, missingCount: quote.missingCount, lines: quote.lines, materials: quote.cutlist.materials },
      );
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
      if (!model.panels.length) throw new Error("No hay muebles que cortar.");
      const plan = buildCutPlan(model, { kerf, trim });
      const base = store.path.replace(/(\.world)?\.json$/, "");
      mkdirSync(dirname(base), { recursive: true });
      writeFileSync(`${base}-despiece.html`, cutSheetHtml(model, world.name, { kerf, trim }));
      writeFileSync(`${base}-despiece.csv`, cutlistCsv(model));
      const lines = plan.totals.map((t) => `${t.sheets} tablero(s) de ${t.materialName} · ocupación ${t.usedPct} %`);
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
