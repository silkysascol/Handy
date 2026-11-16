import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addOpening,
  addRoom,
  activeProviders,
  addBlock,
  compassName,
  REFERENCE_DAYS,
  setSite,
  sunPosition,
  sunReport,
  sunSummary,
  addPoint,
  describeElectrical,
  drillBands,
  electricalTakeoff,
  spreadOutlets,
  getRoom,
  removeBlock,
  roomArea,
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
  rotateItem,
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
        gap: z.number().int().min(0).default(0).describe("Separación en mm entre la espalda del mueble y el muro. 0 = pegado. Mayor que 0 = suelto en el cuarto (mesa, isla), mirando hacia donde mira ese muro"),
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
    async ({ roomId, wall: w, offset, elevation, gap, name, ...params }) => {
      const world = store.load();
      const item = placeCabinet(world, { roomId, wall: w, offset, elevation, gap, name, params });
      store.save(world);
      const issues = checkWorld(world).filter((i) => i.itemId === item.id);
      return text(
        [`${item.name} (id: ${item.id}) colocado ${gap ? `suelto, a ${gap} mm del` : "en el"} ${WALL_NAMES[item.wall]}, de ${offset} a ${offset + params.width} mm.`, ...issues.map((i) => `[${i.level}] ${i.message}`)].join("\n"),
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
        gap: z.number().int().min(0).default(0).describe("Separación en mm entre la espalda del mueble y el muro. 0 = pegado. Mayor que 0 = suelto en el cuarto (mesa, isla), mirando hacia donde mira ese muro"),
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
    async ({ roomId, wall: w, offset, gap, name, type, width, height, depth, profileId, levels, top, joint }) => {
      const world = store.load();
      const item = placeCabinet(world, { roomId, wall: w, offset, gap, name, params: { width, height, depth }, frame: { type, profileId, top, joint, ...(type === "shelving" ? { levels } : {}) } });
      store.save(world);
      const issues = checkWorld(world).filter((i) => i.itemId === item.id);
      const plan = planBars(itemModel(item).bars ?? []);
      return text(
        [`${item.name} (id: ${item.id}) colocada ${gap ? `suelta, a ${gap} mm del` : "en el"} ${WALL_NAMES[item.wall]}, de ${offset} a ${offset + width} mm.`, ...plan.totals.map((t) => `${t.bars} barra(s) de 6 m de ${t.profileName}: ${t.meters} m, ${t.kg} kg, sobra ${t.wastePct} %.`), ...issues.map((i) => `[${i.level}] ${i.message}`)].join("\n"),
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
        gap: z.number().int().min(0).optional().describe("Separación del muro en mm; 0 lo pega al muro"),
        rotate: z.number().int().min(1).max(3).optional().describe("Cuartos de vuelta a la derecha, sin moverlo de sitio (conserva el centro). Se aplica antes que los demás cambios"),
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
    async ({ itemId, name, wall: w, offset, elevation, gap, rotate, ...params }) => {
      const world = store.load();
      const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
      if (rotate) rotateItem(world, itemId, rotate);
      const item = updateItem(world, itemId, { ...(name !== undefined ? { name } : {}), ...(w ? { wall: w } : {}), ...(offset !== undefined ? { offset } : {}), ...(elevation !== undefined ? { elevation } : {}), ...(gap !== undefined ? { gap } : {}), params: clean });
      store.save(world);
      const issues = checkWorld(world).filter((i) => i.itemId === item.id);
      return text([`${item.name}: ${item.params.width} x ${item.params.height} x ${item.params.depth} mm, ${item.gap ? `a ${item.gap} mm del` : "en el"} ${WALL_NAMES[item.wall]}, de ${item.offset} a ${item.offset + item.params.width}.`, ...issues.map((i) => `[${i.level}] ${i.message}`)].join("\n"), { item, issues });
    },
  );

  server.registerTool(
    "world_command",
    {
      title: "Orden en lenguaje natural sobre una selección",
      description: 'Aplica una orden corta en español sobre lo seleccionado, igual que la barra de comandos del visor: "pon una puerta de 80 x 205 a 2 m de la izquierda" (muro), "ensancha 10 cm" (mueble), "muévela 20 cm a la derecha" (abertura), "cocina de 2,8 x 2,4 m" (sin selección). Para la selección envía roomId + wall, o itemId, o roomId + openingId, o solo roomId, o nada.',
      inputSchema: { text: z.string(), roomId: z.string().optional(), wall: wall.optional(), itemId: z.string().optional(), openingId: z.string().optional(), blockId: z.string().optional().describe("Con roomId: una columna o esquina cerrada de esa habitación"), pointId: z.string().optional().describe("Con roomId: una toma, un interruptor o una luz de esa habitación") },
    },
    async ({ text: order, roomId, wall: w, itemId, openingId, blockId, pointId }) => {
      const selection: Selection = itemId ? { kind: "item", itemId } : roomId && pointId ? { kind: "point", roomId, pointId } : roomId && blockId ? { kind: "block", roomId, blockId } : roomId && openingId ? { kind: "opening", roomId, openingId } : roomId && w ? { kind: "wall", roomId, wall: w } : roomId ? { kind: "room", roomId } : { kind: "world" };
      const world = store.load();
      const result = runCommand(world, selection, order);
      if (result.ok) store.save(world);
      return { ...text(result.message, { ...result }), isError: !result.ok };
    },
  );

  server.registerTool(
    "world_set_site",
    {
      title: "Lugar y orientación de la casa",
      description: "Fija dónde está la casa (una ciudad conocida, o latitud y longitud) y hacia dónde mira de verdad el muro norte del modelo. Hace falta para el estudio de sol. north son grados desde el norte en sentido horario: 0 = el muro norte mira al norte, 90 = mira al este. Pregunta al usuario la orientación; no la supongas.",
      inputSchema: {
        place: z.string().optional().describe("Ciudad: Bogotá, Medellín, Cali, Barranquilla, Cartagena, Bucaramanga, Pereira, Ciudad de México, Lima, Quito, Madrid..."),
        latitude: z.number().min(-66).max(66).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        utcOffset: z.number().min(-12).max(14).optional().describe("Horas respecto a UTC de la hora local"),
        north: z.number().min(0).max(360).optional().describe("Hacia dónde mira el muro norte del modelo, en grados"),
      },
    },
    async (input) => {
      const world = store.load();
      const site = setSite(world, input);
      store.save(world);
      return text(`Lugar: ${site.place ?? "coordenadas"} (latitud ${site.latitude}, longitud ${site.longitude}, UTC${site.utcOffset >= 0 ? "+" : ""}${site.utcOffset}). El muro norte del modelo mira al ${compassName(site.north)} (${site.north}°).`, { site });
    },
  );

  server.registerTool(
    "world_sun",
    {
      title: "Estudio de sol",
      description: "Por cada ventana, cuántas horas de sol directo recibe en una fecha, de qué hora a qué hora, hasta dónde entra y sobre qué muebles cae. Sin fecha, da los dos solsticios y un equinoccio. Con time (HH:MM, hora local) dice además dónde está el sol en ese momento. No cuenta edificios vecinos, árboles, aleros ni cortinas. Requiere world_set_site.",
      inputSchema: { roomId: z.string().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD"), time: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("Hora local, HH:MM en 24 horas") },
    },
    async ({ roomId, date, time }) => {
      const world = store.load();
      if (!world.site) throw new Error("Falta el lugar de la casa. Usa world_set_site con la ciudad y la orientación.");
      const year = new Date().getFullYear();
      const days = date ? [{ label: date, date }] : REFERENCE_DAYS(year);
      const lines = days.flatMap((d) => sunSummary(world, d.date, roomId));
      if (time) {
        const [h, m] = time.split(":").map(Number);
        const pos = sunPosition(world.site, days[0].date, h * 60 + m);
        lines.push(pos.altitude > 0 ? `A las ${time} del ${days[0].date} el sol está a ${pos.altitude}° de altura y viene del ${compassName(pos.azimuth)} (${pos.azimuth}°).` : `A las ${time} del ${days[0].date} es de noche.`);
      }
      return text(lines.join("\n"), { site: world.site, days: days.map((d) => ({ date: d.date, windows: sunReport(world, d.date, roomId) })) });
    },
  );

  server.registerTool(
    "world_add_point",
    {
      title: "Agregar punto eléctrico",
      description: "Agrega una toma, un interruptor o un punto de datos en un muro, o una luz en el techo. Sin altura usa la habitual: tomas y datos a 300 mm, interruptores a 1100 mm, tomas sobre mesón a 1100 mm (pásala en height). En cocina, baño, lavadero y exteriores las tomas salen con protección GFCI. No deja poner puntos dentro de puertas o ventanas ni en muro tapado por una columna. Son alturas de práctica común, no una revisión de norma: la instalación la valida un electricista. Para mover o quitar: world_command con roomId y pointId.",
      inputSchema: {
        roomId: z.string(),
        kind: z.enum(["outlet", "switch", "data", "light"]).describe("outlet = toma; switch = interruptor; data = red o TV; light = luz de techo"),
        name: z.string().optional(),
        wall: wall.optional().describe("Para toma, interruptor y datos"),
        offset: z.number().int().min(0).optional().describe("mm desde el extremo izquierdo del muro, mirándolo desde dentro"),
        height: z.number().int().min(100).optional().describe("mm sobre el piso terminado"),
        x: z.number().int().min(0).optional().describe("Solo luz: mm desde el muro oeste"),
        z: z.number().int().min(0).optional().describe("Solo luz: mm desde el muro norte"),
        gfci: z.boolean().optional().describe("Toma con protección de falla a tierra"),
      },
    },
    async ({ roomId, ...input }) => {
      const world = store.load();
      const point = addPoint(world, roomId, input);
      store.save(world);
      const issues = checkWorld(world).filter((i) => i.roomId === roomId && /point|drill/.test(i.code));
      return text([`${point.name} (id: ${point.id}) ${point.kind === "light" ? `en el techo, a ${point.x} mm del muro oeste y ${point.z} del norte` : `en el ${WALL_NAMES[point.wall!]}, a ${point.offset} mm de la izquierda y ${point.height} mm del piso${point.gfci ? ", con protección GFCI" : ""}`}.`, ...issues.map((i) => `[${i.level}] ${i.message}`)].join("\n"), { point, issues });
    },
  );

  server.registerTool(
    "world_electrical",
    {
      title: "Resumen eléctrico de una habitación",
      description: "Puntos eléctricos de una habitación, las franjas donde no conviene perforar (la vertical de cada toma e interruptor, por donde suele ir la tubería), el estimado de cajas, tubería y cable, y los avisos: puntos tapados por muebles y muebles que se fijan sobre una franja. Con spread: true reparte tomas generales por los tramos libres para que ningún punto del muro quede a más de 1,8 m de una.",
      inputSchema: { roomId: z.string(), spread: z.boolean().default(false).describe("Repartir tomas automáticamente antes de resumir") },
    },
    async ({ roomId, spread }) => {
      const world = store.load();
      const made = spread ? spreadOutlets(world, roomId) : [];
      if (made.length) store.save(world);
      const room = getRoom(world, roomId);
      const t = electricalTakeoff(room);
      const bands = drillBands(room);
      const issues = checkWorld(world).filter((i) => i.roomId === roomId && /point|drill/.test(i.code));
      return text([
        ...(made.length ? [`Repartí ${made.length} toma(s): ${made.map((m) => `${WALL_NAMES[m.wall!]} a ${m.offset}`).join("; ")}.`] : []),
        `${room.name}: ${t.outlets} toma(s) (${t.gfci} con GFCI), ${t.switches} interruptor(es), ${t.data} de datos, ${t.lights} luz(ces). Estimado: ${t.boxes} cajas, ${t.conduitM} m de tubería, ${t.wireM} m de cable.`,
        ...describeElectrical(room).slice(1),
        ...(bands.length ? [`No perforar sin comprobar, de piso a techo: ${bands.map((b) => `${WALL_NAMES[b.wall]} de ${b.from} a ${b.to} (${b.name})`).join("; ")}.`] : []),
        ...issues.map((i) => `[${i.level}] ${i.message}`),
      ].join("\n"), { takeoff: t, points: room.points ?? [], bands, issues, made });
    },
  );

  server.registerTool(
    "world_add_block",
    {
      title: "Agregar columna, buitrón o esquina cerrada",
      description: "Agrega un macizo dentro de una habitación: una columna, un buitrón, una chimenea, un muro bajo, o una esquina cerrada que convierte el rectángulo en una L. Descuenta piso, bloquea tramos de muro y estorba a los muebles. Para una L, pon el macizo en la esquina (por ejemplo x = ancho de la habitación menos su ancho, z = 0 para la esquina noreste). Para moverlo o cambiarlo usa world_command con roomId y blockId.",
      inputSchema: {
        roomId: z.string(),
        name: z.string().optional().describe("Columna, Buitrón, Esquina cerrada, Muro bajo..."),
        x: z.number().int().min(0).describe("Distancia en mm desde el muro oeste hasta el macizo"),
        z: z.number().int().min(0).describe("Distancia en mm desde el muro norte hasta el macizo"),
        width: z.number().int().min(50).describe("De oeste a este, en mm"),
        depth: z.number().int().min(50).describe("De norte a sur, en mm"),
        height: z.number().int().min(50).optional().describe("Alto en mm; sin él llega al techo"),
      },
    },
    async ({ roomId, ...input }) => {
      const world = store.load();
      const block = addBlock(world, roomId, input);
      store.save(world);
      const room = getRoom(world, roomId);
      const issues = checkWorld(world).filter((i) => i.roomId === roomId && i.code === "hits-block");
      return text([`${block.name} (id: ${block.id}) de ${block.width} x ${block.depth} mm en ${room.name}, a ${block.x} mm del muro oeste y ${block.z} mm del muro norte${block.height ? `, alto ${block.height}` : ", hasta el techo"}. Piso libre: ${(roomArea(room) / 1e6).toFixed(2)} m².`, ...issues.map((i) => `[${i.level}] ${i.message}`)].join("\n"), { block, freeAreaM2: roomArea(room) / 1e6, issues });
    },
  );

  server.registerTool(
    "world_remove_block",
    { title: "Quitar columna o esquina cerrada", description: "Quita un macizo de una habitación por su id (ver world_describe).", inputSchema: { roomId: z.string(), blockId: z.string() } },
    async ({ roomId, blockId }) => {
      const world = store.load();
      if (!removeBlock(world, roomId, blockId)) throw new Error(`No existe "${blockId}" en esa habitación.`);
      store.save(world);
      return text(`${blockId} quitado. Piso libre: ${(roomArea(getRoom(world, roomId)) / 1e6).toFixed(2)} m².`);
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
        [`Cotización: ${quote.subtotal} ${quote.currency} (muebles ${quote.groups.furniture}, pisos ${quote.groups.floors}, eléctrico ${quote.groups.electrical})${quote.missingCount ? ` · INCOMPLETA: ${quote.missingCount} ítems sin precio` : ""} · ${source}${quote.staleCount ? ` · ${quote.staleCount} precios con más de 30 días` : ""}`, ...lines, ...stores].join("\n"),
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
