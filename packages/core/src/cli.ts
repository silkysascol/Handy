#!/usr/bin/env node
/**
 * CLI mínima: `pnpm cli cabinet --width 800 --height 2000 --depth 500 --shelves 3 --doors 2`
 * Imprime lista de corte, avisos y cotización usando el catálogo de ejemplo.
 */
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateCabinet, buildQuote, validateFurniture, StaticCatalogProvider, type StaticCatalog, type Joinery } from "./index.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: "string", default: "800" },
    height: { type: "string", default: "2000" },
    depth: { type: "string", default: "500" },
    shelves: { type: "string", default: "3" },
    doors: { type: "string", default: "2" },
    plinth: { type: "string", default: "0" },
    joinery: { type: "string", default: "confirmat" },
    catalog: { type: "string" },
    json: { type: "boolean", default: false },
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
  doors: Number(values.doors) as 0 | 1 | 2,
  plinthHeight: Number(values.plinth),
  joinery: values.joinery as Joinery,
});
const issues = validateFurniture(model);
const quote = await buildQuote(model, [new StaticCatalogProvider(catalog)]);

if (values.json) {
  console.log(JSON.stringify({ model, issues, quote }, null, 2));
  process.exit(0);
}

console.log(`\n${model.name}  (unión: ${model.joinery})\n`);
console.log("LISTA DE CORTE (mm)");
console.table(quote.cutlist.rows.map((r) => ({ Pieza: r.name, Cant: r.qty, Largo: r.height, Ancho: r.width, Esp: r.thickness, Cantos: r.edges, "Tapacanto m": r.edgeBandMeters })));
console.log("MATERIALES");
console.table(quote.cutlist.materials.map((m) => ({ Material: m.materialId, "m²": m.areaM2, Tableros: m.sheetsEstimate })));
if (issues.length) {
  console.log("AVISOS");
  for (const i of issues) console.log(`  [${i.level}] ${i.message}`);
}
console.log(`\nCOTIZACIÓN (${quote.currency}, catálogo: ${catalog.name})`);
console.table(quote.lines.map((l) => ({ Ítem: l.description, Cant: l.qty, Unidad: l.unit, "P. unit": l.unitPrice, Total: Number(l.total.toFixed(2)), Falta: l.missing ? "sí" : "" })));
console.log(`Subtotal aprox.: ${quote.subtotal} ${quote.currency}${quote.missingCount ? `  (${quote.missingCount} ítems sin precio)` : ""}\n`);
