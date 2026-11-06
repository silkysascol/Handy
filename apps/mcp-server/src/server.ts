import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  buildCutlist,
  buildQuote,
  checkMotionCollisions,
  generateCabinet,
  validateFurniture,
  StaticCatalogProvider,
  type PriceProvider,
  type StaticCatalog,
} from "@handy/core";

const require = createRequire(import.meta.url);

/** Catálogo de precios usado por defecto. Reemplazable con HANDY_CATALOG=/ruta/catalogo.json */
export function loadProviders(): PriceProvider[] {
  const path = process.env.HANDY_CATALOG ?? require.resolve("@handy/core/data/catalog-ejemplo.json");
  const catalog = JSON.parse(readFileSync(path, "utf8")) as StaticCatalog;
  return [new StaticCatalogProvider(catalog)];
}

const cabinetInput = {
  width: z.number().int().min(100).max(3000).describe("Ancho exterior en mm"),
  height: z.number().int().min(100).max(3000).describe("Alto exterior en mm"),
  depth: z.number().int().min(100).max(1000).describe("Profundidad exterior en mm"),
  shelves: z.number().int().min(0).max(20).default(0).describe("Repisas interiores móviles"),
  doors: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0).describe("Puertas batientes"),
  plinthHeight: z.number().int().min(0).max(200).default(0).describe("Altura del zócalo en mm (0 = sin zócalo)"),
  joinery: z.enum(["confirmat", "minifix", "dowel", "pocket-screw"]).default("confirmat").describe("Sistema de unión. minifix o dowel = sin tornillos visibles"),
  boardThickness: z.number().int().min(12).max(30).default(18).describe("Espesor del tablero en mm"),
  name: z.string().optional(),
};

const obstacleSchema = z.object({
  id: z.string(),
  name: z.string().describe("Qué es: muro, lavavajillas abierto, otro mueble"),
  min: z.tuple([z.number(), z.number(), z.number()]).describe("Esquina mínima [x, y, z] en mm, en el sistema del mueble (origen: esquina inferior izquierda trasera; z crece hacia el frente)"),
  max: z.tuple([z.number(), z.number(), z.number()]),
});
const obstaclesInput = z.array(obstacleSchema).default([]).describe("Obstáculos alrededor del mueble para comprobar colisiones al abrir puertas y cajones");

export function createHandyServer(providers: PriceProvider[] = loadProviders()): McpServer {
  const server = new McpServer({ name: "handy", version: "0.0.1" });

  server.registerTool(
    "design_cabinet",
    {
      title: "Diseñar gabinete",
      description:
        "Genera un gabinete de melamina (costados, techo, piso, fondo, repisas, puertas). Devuelve el modelo con posiciones 3D, la lista de corte, avisos de diseño y una cotización aproximada con el catálogo configurado. Todas las medidas en milímetros.",
      inputSchema: { ...cabinetInput, obstacles: obstaclesInput },
    },
    async ({ obstacles, ...params }) => {
      const model = generateCabinet(params);
      const issues = validateFurniture(model);
      const collisions = checkMotionCollisions(model, obstacles.map((o) => ({ id: o.id, name: o.name, box: { min: o.min, max: o.max } })));
      const quote = await buildQuote(model, providers);
      const summary = [
        `${model.name} (unión: ${model.joinery})`,
        `Piezas: ${model.panels.reduce((n, p) => n + p.qty, 0)} · Tableros: ${quote.cutlist.materials.map((m) => `${m.sheetsEstimate}x ${m.materialId}`).join(", ")}`,
        `Cotización aprox.: ${quote.subtotal} ${quote.currency}${quote.missingCount ? ` (${quote.missingCount} ítems sin precio)` : ""}`,
        ...issues.map((i) => `[${i.level}] ${i.message}`),
        ...collisions.map((c) => `[colisión] ${c.message}`),
      ].join("\n");
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: { model, issues, collisions, cutlist: quote.cutlist, quote: { currency: quote.currency, subtotal: quote.subtotal, lines: quote.lines } },
      };
    },
  );

  server.registerTool(
    "cutlist",
    {
      title: "Lista de corte",
      description: "Calcula la lista de corte (piezas, cantos, m² y tableros) de un gabinete sin cotizar.",
      inputSchema: cabinetInput,
    },
    async (params) => {
      const cutlist = buildCutlist(generateCabinet(params));
      return { content: [{ type: "text", text: JSON.stringify(cutlist, null, 2) }], structuredContent: cutlist as unknown as Record<string, unknown> };
    },
  );

  server.registerTool(
    "check_collisions",
    {
      title: "Comprobar colisiones",
      description: "Simula la apertura de puertas y cajones de un gabinete y reporta choques con el propio mueble o con obstáculos (muros, electrodomésticos abiertos, otros muebles). Devuelve el ángulo o recorrido donde empieza cada choque.",
      inputSchema: { ...cabinetInput, obstacles: obstaclesInput },
    },
    async ({ obstacles, ...params }) => {
      const model = generateCabinet(params);
      const collisions = checkMotionCollisions(model, obstacles.map((o) => ({ id: o.id, name: o.name, box: { min: o.min, max: o.max } })));
      const text = collisions.length ? collisions.map((c) => c.message).join("\n") : "Sin colisiones en todo el recorrido.";
      return { content: [{ type: "text", text }], structuredContent: { collisions } };
    },
  );

  server.registerTool(
    "search_prices",
    {
      title: "Buscar precios",
      description: "Busca ofertas de materiales o herrajes en los proveedores configurados. Categorías: board, edgeband, hinge, handle, confirmat, cam-lock, dowel, shelf-pin, screw, foot.",
      inputSchema: {
        category: z.string(),
        text: z.string().optional(),
        thickness: z.number().optional(),
        finish: z.string().optional(),
      },
    },
    async (query) => {
      const offers = (await Promise.all(providers.map((p) => p.search(query)))).flat();
      return { content: [{ type: "text", text: JSON.stringify(offers, null, 2) }], structuredContent: { offers } };
    },
  );

  return server;
}
