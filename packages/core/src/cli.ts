#!/usr/bin/env node
/**
 * CLI mínima: `pnpm cli cabinet --width 800 --height 2000 --depth 500 --shelves 3 --doors 2`
 * Imprime lista de corte, avisos y cotización usando el catálogo de ejemplo.
 */
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateCabinet, buildQuote, validateFurniture, checkMotionCollisions, StaticCatalogProvider, type StaticCatalog, type Joinery, type Obstacle } from "./index.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: "string", default: "800" },
    height: { type: "string", default: "2000" },
    depth: { type: "string", default: "500" },
    shelves: { type: "string", default: "3" },
    doors: { type: "string", default: "2" },
    dividers: { type: "string", default: "0" },
    drawers: { type: "string", default: "0" },
    bar: { type: "boolean", default: false },
    plinth: { type: "string", default: "0" },
    joinery: { type: "string", default: "confirmat" },
    catalog: { type: "string" },
    json: { type: "boolean", default: false },
    "wall-left": { type: "boolean", default: false },
    "wall-right": { type: "boolean", default: false },
  },
});

const command = positionals[0] ?? "cabinet";
if (command !== "cabinet") {
  console.error(`Comando desconocido: ${command}. Disponible: cabinet`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = values.catalog ?? join(here, "..", "data", "catalog-ejemplo.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as StaticCatalog;

const model = generateCabinet({
  width: Number(values.width),
  height: Number(values.height),
  depth: Number(values.depth),
  shelves: Number(values.shelves),
  doors: Number(values.doors),
  dividers: Number(values.dividers),
  drawers: Number(values.drawers),
  hangingBar: values.bar,
  plinthHeight: Number(values.plinth),
  joinery: values.joinery as Joinery,
});
const issues = validateFurniture(model);
const obstacles: Obstacle[] = [];
if (values["wall-left"]) obstacles.push({ id: "wall-left", name: "muro a la izquierda", box: { min: [-300, 0, -2000], max: [0, 3000, 3000] } });
if (values["wall-right"]) obstacles.push({ id: "wall-right", name: "muro a la derecha", box: { min: [model.dims.width, 0, -2000], max: [model.dims.width + 300, 3000, 3000] } });
const collisions = checkMotionCollisions(model, obstacles);
const quote = await buildQuote(model, [new StaticCatalogProvider(catalog)]);

if (values.json) {
  console.log(JSON.stringify({ model, issues, collisions, quote }, null, 2));
  process.exit(0);
}

console.log(`\n${model.name}  (unión: ${model.joinery})\n`);
console.log("LISTA DE CORTE (mm)");
console.table(quote.cutlist.rows.map((r) => ({ Pieza: r.name, Cant: r.qty, Largo: r.height, Ancho: r.width, Esp: r.thickness, Cantos: r.edges, "Tapacanto m": r.edgeBandMeters })));
console.log("MATERIALES");
console.table(quote.cutlist.materials.map((m) => ({ Material: m.materialId, "m²": m.areaM2, Tableros: m.sheetsEstimate })));
if (issues.length || collisions.length) {
  console.log("AVISOS");
  for (const i of issues) console.log(`  [${i.level}] ${i.message}`);
  for (const c of collisions) console.log(`  [colisión] ${c.message}`);
}
console.log(`\nCOTIZACIÓN (${quote.currency}, catálogo: ${catalog.name})`);
console.table(quote.lines.map((l) => ({ Ítem: l.description, Cant: l.qty, Unidad: l.unit, "P. unit": l.unitPrice, Total: Number(l.total.toFixed(2)), Falta: l.missing ? "sí" : "" })));
console.log(`Subtotal aprox.: ${quote.subtotal} ${quote.currency}${quote.missingCount ? `  (${quote.missingCount} ítems sin precio)` : ""}\n`);
