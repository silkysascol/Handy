#!/usr/bin/env node
/** Genera el mundo de ejemplo en docs/ejemplos: `pnpm --filter @handy/core demo:world`. */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { addOpening, addRoom, assemblyHtml, checkWorld, createWorld, cutSheetHtml, describeWorld, exportGltf, itemModel, mergedModel, placeCabinet } from "./index.js";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "ejemplos");
const w = createWorld("Apartamento demo");

const dorm = addRoom(w, { name: "Dormitorio", width: 3600, depth: 3200, height: 2400, wallThickness: { north: 200, east: 200, south: 100, west: 100 } });
addOpening(w, dorm.id, { wall: "south", type: "door", offset: 200, width: 800, height: 2050 });
addOpening(w, dorm.id, { wall: "north", type: "window", offset: 1200, width: 1200, height: 1200, sill: 1000 });
placeCabinet(w, { roomId: dorm.id, wall: "east", offset: 600, name: "Armario", params: { width: 800, height: 2000, depth: 500, shelves: 3, doors: 2, plinthHeight: 80, joinery: "minifix" } });
placeCabinet(w, { roomId: dorm.id, wall: "east", offset: 1400, name: "Armario 2", params: { width: 800, height: 2000, depth: 500, shelves: 3, doors: 2, plinthHeight: 80, joinery: "minifix" } });
placeCabinet(w, { roomId: dorm.id, wall: "west", offset: 400, name: "Biblioteca", params: { width: 900, height: 1800, depth: 300, shelves: 4, joinery: "minifix" } });

const cocina = addRoom(w, { name: "Cocina", width: 2800, depth: 2400, height: 2400, wallThickness: 150, origin: [4000, 0] });
addOpening(w, cocina.id, { wall: "south", type: "pass", offset: 1800, width: 900, height: 2100 });
addOpening(w, cocina.id, { wall: "north", type: "window", offset: 800, width: 1000, height: 1000, sill: 1100 });
placeCabinet(w, { roomId: cocina.id, wall: "north", offset: 0, name: "Bajo 1", params: { width: 600, height: 720, depth: 580, shelves: 1, doors: 1, joinery: "minifix" } });
placeCabinet(w, { roomId: cocina.id, wall: "north", offset: 600, name: "Bajo 2", params: { width: 900, height: 720, depth: 580, shelves: 1, doors: 2, joinery: "minifix" } });
placeCabinet(w, { roomId: cocina.id, wall: "north", offset: 1900, elevation: 1500, name: "Alto 1", params: { width: 900, height: 700, depth: 350, shelves: 1, doors: 2, joinery: "minifix" } });

w.updatedAt = "2026-11-10";
writeFileSync(join(out, "apartamento-demo.world.json"), JSON.stringify(w, null, 2) + "\n");
writeFileSync(join(out, "apartamento-demo.gltf"), exportGltf(w));
writeFileSync(join(out, "apartamento-demo-despiece.html"), cutSheetHtml(mergedModel(w), w.name));
// Manual de armado del primer mueble de tablero, como ejemplo.
const sample = w.items.find((i) => i.kind !== "frame");
if (sample) writeFileSync(join(out, "apartamento-demo-armado.html"), assemblyHtml(itemModel(sample), sample.name));
console.log(describeWorld(w));
console.log("\nRevisión:");
const issues = checkWorld(w);
for (const i of issues) console.log(`  [${i.level}] ${i.message}`);
if (!issues.length) console.log("  sin avisos");
