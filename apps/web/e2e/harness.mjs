/**
 * Arnés de pruebas de navegador: levanta el servidor local de Handy con un mundo temporal,
 * abre Chromium y ofrece ayudas para escribir casos. Se usa desde run.mjs.
 */
import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");
const repoRoot = join(webRoot, "..", "..");

export function loadPlaywright() {
  try { return require("playwright"); } catch { return null; }
}

export async function startHandy({ demo = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "handy-e2e-"));
  const worldPath = join(dir, "casa.world.json");
  if (demo) copyFileSync(join(repoRoot, "docs", "ejemplos", "apartamento-demo.world.json"), worldPath);
  // PORT=0: el sistema asigna un puerto libre y el servidor lo anuncia en su primera línea.
  const server = spawn(process.execPath, [join(webRoot, "node_modules", "tsx", "dist", "cli.mjs"), join(webRoot, "src", "server.ts")], {
    env: { ...process.env, HANDY_WORLD: worldPath, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => { log += d; });
  server.stderr.on("data", (d) => { log += d; });
  let url;
  for (let i = 0; i < 80 && !url; i++) {
    const m = log.match(/Handy en http:\/\/localhost:(\d+)/);
    if (m) url = `http://127.0.0.1:${m[1]}`;
    else await new Promise((r) => setTimeout(r, 250));
  }
  if (!url) { server.kill(); throw new Error(`El servidor no arrancó:\n${log}`); }
  const ready = await fetch(`${url}/api/world`);
  if (ready.status !== 200 && ready.status !== 204) { server.kill(); throw new Error(`El servidor respondió ${ready.status}`); }
  return {
    url, dir, worldPath,
    readWorld: () => JSON.parse(readFileSync(worldPath, "utf8")),
    writeWorld: (w) => writeFileSync(worldPath, JSON.stringify({ ...w, updatedAt: new Date().toISOString() }, null, 2)),
    stop: () => server.kill(),
  };
}

export async function openPage(playwright, url, { colorScheme = "dark" } = {}) {
  const browser = await playwright.chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction("window.__handy && window.__handy.ready === true", null, { timeout: 30000 });
  const h = {
    page, browser, errors,
    world: () => page.evaluate("window.__handy.getWorld()"),
    selection: () => page.evaluate("window.__handy.getSelection()"),
    /** Selecciona desde el árbol lateral por texto visible; `nth` cuando hay varios iguales. */
    pick: async (text, nth = 0) => { await page.locator(".node", { hasText: text }).nth(nth).click(); },
    /** Escribe una orden y espera la respuesta; devuelve el mensaje mostrado. */
    say: async (text) => {
      await page.fill("#cmd-input", text);
      await page.keyboard.press("Enter");
      await page.waitForFunction("document.getElementById('toast').classList.contains('show')", null, { timeout: 5000 });
      await page.waitForTimeout(150);
      return (await page.textContent("#toast")).replace("Copiar para mi IA", "").trim();
    },
    /** Hace clic en la vista 3D hasta dar con una selección que cumpla `match`. */
    clickUntil: async (match) => {
      const r = await page.evaluate(() => { const b = document.querySelector("#view canvas").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
      for (let fy = 0.15; fy <= 0.85; fy += 0.035) for (let fx = 0.1; fx <= 0.9; fx += 0.03) {
        await page.mouse.click(r.x + r.w * fx, r.y + r.h * fy);
        const s = await page.evaluate("window.__handy.getSelection()");
        if (match(s)) return { fx, fy };
      }
      return null;
    },
    close: () => browser.close(),
  };
  return h;
}
