#!/usr/bin/env node
/**
 * Servidor local de Handy: sirve el visor ya construido (dist/) y expone el mundo del usuario,
 * el mismo archivo que lee y escribe el servidor MCP. Así lo que hace la IA aparece en vivo en el visor.
 *   GET  /api/world   → el mundo (204 si aún no existe)
 *   PUT  /api/world   → guarda el mundo
 *   GET  /api/events  → Server-Sent Events: avisa cuando el archivo cambia
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, watchFile, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const worldPath = resolve(process.env.HANDY_WORLD ?? join(homedir(), ".handy", "mundo.world.json"));
const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = Number(process.env.PORT ?? 5174);
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

const clients = new Set<import("node:http").ServerResponse>();
watchFile(worldPath, { interval: 400 }, () => { for (const c of clients) c.write(`data: changed\n\n`); });

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/api/world" && req.method === "GET") {
    // Sin mundo todavía: 204, que no es un error. El visor crea uno de arranque.
    if (!existsSync(worldPath)) { res.writeHead(204, { "x-handy-world": "none" }).end(); return; }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(readFileSync(worldPath));
    return;
  }
  if (url.pathname === "/api/world" && req.method === "PUT") {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      try {
        const world = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (world?.version !== 1 || !Array.isArray(world.rooms) || !Array.isArray(world.items)) throw new Error("No es un mundo de Handy");
        mkdirSync(dirname(worldPath), { recursive: true });
        writeFileSync(worldPath, JSON.stringify(world, null, 2) + "\n");
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, path: worldPath }));
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: (e as Error).message }));
      }
    });
    return;
  }
  if (url.pathname === "/api/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(`data: hello\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  // Estáticos
  const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
  const file = join(dist, rel);
  if (file.startsWith(dist) && existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
    return;
  }
  res.writeHead(404).end("No encontrado");
}).listen(port, function (this: import("node:net").Server) {
  // Con PORT=0 el sistema asigna un puerto libre; se informa el real.
  const actual = (this.address() as import("node:net").AddressInfo).port;
  console.log(`Handy en http://localhost:${actual}  ·  mundo: ${worldPath}`);
  if (!existsSync(join(dist, "index.html"))) console.log("Aviso: falta construir el visor. Ejecuta: pnpm --filter @handy/web build");
});
