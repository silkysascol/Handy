import type { FurnitureModel, Material, Millimeters, Panel } from "./model/index.js";

/**
 * Plano de corte: acomoda las piezas en tableros enteros para saber cuántos comprar de verdad
 * y entregar a la tienda un despiece que la sierra pueda seguir (cortes de lado a lado).
 * Algoritmo por franjas: ordena por alto, llena franjas horizontales de izquierda a derecha y
 * aprovecha el sobrante de cada columna apilando piezas más bajas.
 */
export interface CutPlanOptions {
  /** Ancho del disco de la sierra. */
  kerf?: Millimeters;
  /** Refilado: margen que se pierde en cada borde del tablero. */
  trim?: Millimeters;
  /** Formato cuando el material no declara el suyo. */
  defaultSheet?: { width: Millimeters; height: Millimeters };
}

export interface PlacedPiece {
  panelId: string;
  name: string;
  /** Posición de la esquina inferior izquierda dentro del tablero. */
  x: Millimeters;
  y: Millimeters;
  /** Medidas tal como quedan en el tablero. */
  w: Millimeters;
  h: Millimeters;
  rotated: boolean;
}

export interface SheetPlan {
  materialId: string;
  materialName: string;
  thickness: Millimeters;
  width: Millimeters;
  height: Millimeters;
  pieces: PlacedPiece[];
  /** Porcentaje del tablero ocupado por piezas. */
  usedPct: number;
}

export interface CutPlan {
  sheets: SheetPlan[];
  /** Tableros por material. */
  totals: { materialId: string; materialName: string; thickness: Millimeters; sheets: number; usedPct: number }[];
  /** Piezas que no caben en un tablero ni girándolas. */
  oversize: { panelId: string; name: string; width: Millimeters; height: Millimeters }[];
  kerf: Millimeters;
  trim: Millimeters;
}

interface Piece { panelId: string; name: string; w: number; h: number; canRotate: boolean; rotated: boolean }
interface Strip { y: number; h: number; columns: { x: number; w: number; usedH: number }[]; usedW: number }

const WOODY = /roble|nogal|cedro|madera|wood|oak|walnut|teca|wengue|haya|pino/i;

/** Una pieza se puede girar si el decorado no tiene veta o la pieza no la exige. */
function canRotate(panel: Panel, material?: Material): boolean {
  if (panel.grain === "none") return true;
  return !WOODY.test(`${material?.finish ?? ""} ${material?.name ?? ""}`);
}

function packMaterial(pieces: Piece[], W: number, H: number, kerf: number): { sheets: PlacedPiece[][]; oversize: Piece[] } {
  const oversize: Piece[] = [];
  const todo: Piece[] = [];
  for (const p of pieces) {
    const fits = p.w <= W && p.h <= H, fitsRot = p.canRotate && p.h <= W && p.w <= H;
    if (!fits && !fitsRot) { oversize.push(p); continue; }
    // Orientación de partida: el lado largo en vertical si se puede, para franjas altas y bien llenas.
    const stand = p.canRotate && ((p.w > p.h && p.w <= H && p.h <= W) || !fits);
    todo.push(stand ? { ...p, w: p.h, h: p.w, rotated: true } : p);
  }
  todo.sort((a, b) => b.h - a.h || b.w - a.w);

  const sheets: { strips: Strip[]; usedH: number; placed: PlacedPiece[] }[] = [];

  for (const p of todo) {
    let done = false;
    const options: { w: number; h: number; rotated: boolean }[] = [{ w: p.w, h: p.h, rotated: p.rotated }];
    if (p.canRotate && p.w !== p.h) options.push({ w: p.h, h: p.w, rotated: !p.rotated });

    for (const sheet of sheets) {
      // 1) Apilar sobre una columna existente de alguna franja.
      for (const strip of sheet.strips) {
        for (const col of strip.columns) {
          const o = options.find((x) => x.w <= col.w && col.usedH + kerf + x.h <= strip.h);
          if (!o) continue;
          sheet.placed.push({ panelId: p.panelId, name: p.name, x: col.x, y: strip.y + col.usedH + kerf, w: o.w, h: o.h, rotated: o.rotated });
          col.usedH += kerf + o.h;
          done = true; break;
        }
        if (done) break;
        // 2) Nueva columna a la derecha en la franja.
        const o = options.find((x) => x.h <= strip.h && strip.usedW + (strip.columns.length ? kerf : 0) + x.w <= W);
        if (o) {
          const x = strip.usedW + (strip.columns.length ? kerf : 0);
          strip.columns.push({ x, w: o.w, usedH: o.h });
          strip.usedW = x + o.w;
          sheet.placed.push({ panelId: p.panelId, name: p.name, x, y: strip.y, w: o.w, h: o.h, rotated: o.rotated });
          done = true; break;
        }
      }
      if (done) break;
      // 3) Nueva franja en este tablero.
      const y = sheet.usedH + (sheet.strips.length ? kerf : 0);
      const o = options.find((x) => x.w <= W && y + x.h <= H);
      if (o) {
        sheet.strips.push({ y, h: o.h, columns: [{ x: 0, w: o.w, usedH: o.h }], usedW: o.w });
        sheet.usedH = y + o.h;
        sheet.placed.push({ panelId: p.panelId, name: p.name, x: 0, y, w: o.w, h: o.h, rotated: o.rotated });
        done = true; break;
      }
    }
    if (!done) {
      const o = options.find((x) => x.w <= W && x.h <= H)!;
      sheets.push({ strips: [{ y: 0, h: o.h, columns: [{ x: 0, w: o.w, usedH: o.h }], usedW: o.w }], usedH: o.h, placed: [{ panelId: p.panelId, name: p.name, x: 0, y: 0, w: o.w, h: o.h, rotated: o.rotated }] });
    }
  }
  return { sheets: sheets.map((s) => s.placed), oversize };
}

export function buildCutPlan(model: FurnitureModel, options: CutPlanOptions = {}): CutPlan {
  const kerf = options.kerf ?? 3, trim = options.trim ?? 10;
  const fallback = options.defaultSheet ?? { width: 1830, height: 2440 };
  const groups = new Map<string, { material?: Material; thickness: number; pieces: Piece[] }>();
  for (const panel of model.panels) {
    const material = model.materials.find((m) => m.id === panel.materialId);
    const g = groups.get(panel.materialId) ?? { material, thickness: panel.thickness, pieces: [] };
    for (let i = 0; i < panel.qty; i++) {
      // En la lista de corte `height` es el largo (dirección de la veta) y `width` el ancho.
      g.pieces.push({ panelId: panel.id, name: panel.qty > 1 ? `${panel.name} ${i + 1}/${panel.qty}` : panel.name, w: panel.width, h: panel.height, canRotate: canRotate(panel, material), rotated: false });
    }
    groups.set(panel.materialId, g);
  }

  const plan: CutPlan = { sheets: [], totals: [], oversize: [], kerf, trim };
  for (const [materialId, g] of groups) {
    const sheet = g.material?.sheet ?? fallback;
    const W = sheet.width - 2 * trim, H = sheet.height - 2 * trim;
    const { sheets, oversize } = packMaterial(g.pieces, W, H, kerf);
    const name = g.material?.name ?? materialId;
    let usedTotal = 0;
    for (const pieces of sheets) {
      const used = pieces.reduce((a, p) => a + p.w * p.h, 0);
      usedTotal += used;
      plan.sheets.push({ materialId, materialName: name, thickness: g.thickness, width: sheet.width, height: sheet.height, pieces: pieces.map((p) => ({ ...p, x: p.x + trim, y: p.y + trim })), usedPct: Math.round((used / (sheet.width * sheet.height)) * 100) });
    }
    plan.totals.push({ materialId, materialName: name, thickness: g.thickness, sheets: sheets.length, usedPct: sheets.length ? Math.round((usedTotal / (sheets.length * sheet.width * sheet.height)) * 100) : 0 });
    plan.oversize.push(...oversize.map((p) => ({ panelId: p.panelId, name: p.name, width: p.w, height: p.h })));
  }
  return plan;
}

const escXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Dibujo del plano de corte, escala 1:5: un tablero debajo de otro. Cada pieza lleva un número y sus
 * medidas; la leyenda de la derecha dice qué pieza es cada número.
 */
export function cutPlanSvg(plan: CutPlan): string {
  const S = 0.2, pad = 24, legendX = pad + 1830 * S + 28, lineH = 15;
  const width = legendX + 380;
  let y = pad;
  const body: string[] = [];
  for (const s of plan.sheets) {
    const sameMaterial = plan.sheets.filter((x) => x.materialId === s.materialId);
    body.push(`<text x="${pad}" y="${y + 14}" font-size="15" font-weight="700">Tablero ${sameMaterial.indexOf(s) + 1} de ${sameMaterial.length} · ${escXml(s.materialName)}</text>`);
    body.push(`<text x="${pad}" y="${y + 31}" font-size="12" fill="#56606a">${s.width} x ${s.height} mm · ocupado ${s.usedPct} % · ${s.pieces.length} piezas</text>`);
    const top = y + 42;
    body.push(`<rect x="${pad}" y="${top}" width="${s.width * S}" height="${s.height * S}" fill="#efece4" stroke="#1b1f23" stroke-width="1.5"/>`);
    // Orden de lectura: de arriba a abajo y de izquierda a derecha, como se ve en el dibujo.
    const ordered = [...s.pieces].sort((a, b) => b.y + b.h - (a.y + a.h) || a.x - b.x);
    ordered.forEach((p, i) => {
      // El SVG crece hacia abajo; el tablero se dibuja con el origen abajo a la izquierda.
      const px = pad + p.x * S, py = top + (s.height - p.y - p.h) * S, pw = p.w * S, ph = p.h * S;
      body.push(`<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" fill="#ffffff" stroke="#1b1f23" stroke-width="1"/>`);
      const big = pw >= 44 && ph >= 30;
      body.push(`<text x="${(px + pw / 2).toFixed(1)}" y="${(py + ph / 2 + (big ? -1 : 4)).toFixed(1)}" font-size="${big ? 13 : 10}" font-weight="700" text-anchor="middle">${i + 1}</text>`);
      // Siempre largo x ancho de la pieza, aunque en el tablero vaya girada.
      const dims = p.rotated ? `${p.w} x ${p.h}` : `${p.h} x ${p.w}`;
      if (big) body.push(`<text x="${(px + pw / 2).toFixed(1)}" y="${(py + ph / 2 + 12).toFixed(1)}" font-size="9" text-anchor="middle" font-family="monospace">${dims.replace(/ /g, "")}</text>`);
      body.push(`<text x="${legendX}" y="${top + 12 + i * lineH}" font-size="11"><tspan font-weight="700">${i + 1}</tspan>  ${escXml(p.name)}  <tspan font-family="monospace" fill="#56606a">${dims}${p.rotated ? " ↻" : ""}</tspan></text>`);
    });
    y = top + Math.max(s.height * S, 12 + ordered.length * lineH) + 34;
  }
  if (plan.oversize.length) { body.push(`<text x="${pad}" y="${y + 14}" font-size="13" fill="#8c1d18">No caben en un tablero: ${escXml(plan.oversize.map((o) => `${o.name} (${o.height} x ${o.width})`).join(", "))}</text>`); y += 30; }
  const height = y + 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Helvetica, Arial, sans-serif" fill="#1b1f23">\n<rect width="100%" height="100%" fill="#ffffff"/>\n${body.join("\n")}\n<text x="${pad}" y="${height - 12}" font-size="11" fill="#56606a">Handy · escala 1:5 · disco ${plan.kerf} mm · refilado ${plan.trim} mm por borde · medidas en mm, largo x ancho · ↻ pieza girada</text>\n</svg>\n`;
}

/** Despiece en CSV para la tienda: una fila por pieza distinta, con cantos a enchapar. */
export function cutlistCsv(model: FurnitureModel): string {
  const rows = [["Pieza", "Cantidad", "Largo (mm)", "Ancho (mm)", "Espesor (mm)", "Material", "Veta", "Canto largo 1", "Canto largo 2", "Canto corto 1", "Canto corto 2", "Notas"]];
  for (const p of model.panels) {
    const mat = model.materials.find((m) => m.id === p.materialId);
    const yes = (b: boolean) => (b ? "X" : "");
    rows.push([p.name, String(p.qty), String(p.height), String(p.width), String(p.thickness), mat?.name ?? p.materialId, p.grain === "none" ? "libre" : "a lo largo", yes(p.edgeBanding.left), yes(p.edgeBanding.right), yes(p.edgeBanding.top), yes(p.edgeBanding.bottom), p.notes ?? ""]);
  }
  return rows.map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";")).join("\n") + "\n";
}

/** Documento imprimible para llevar a la tienda: resumen de tableros, lista de piezas con cantos y plano de corte. */
export function cutSheetHtml(model: FurnitureModel, title: string, options: CutPlanOptions = {}): string {
  const plan = buildCutPlan(model, options);
  const csv = cutlistCsv(model);
  const rows = csv.trim().split("\n").map((r) => r.split(";"));
  const edgeMeters = model.panels.reduce((m, p) => m + ((Number(p.edgeBanding.left) + Number(p.edgeBanding.right)) * p.height + (Number(p.edgeBanding.top) + Number(p.edgeBanding.bottom)) * p.width) * p.qty, 0) / 1000;
  const table = `<table><thead><tr>${rows[0].map((h) => `<th>${escXml(h)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c, i) => `<td${i >= 1 && i <= 4 ? ' class="n"' : ""}>${escXml(c.replace(/^"|"$/g, ""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const totals = plan.totals.map((t) => `<li><strong>${t.sheets}</strong> tablero(s) de ${escXml(t.materialName)} · ocupación ${t.usedPct} %</li>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Despiece · ${escXml(title)}</title><style>
body{font:13px/1.4 Helvetica,Arial,sans-serif;color:#1b1f23;margin:24px;max-width:900px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #c9ced3;padding:4px 6px;text-align:left;font-size:12px}th{background:#f1f2f4}td.n{font-family:monospace;text-align:right}
.muted{color:#56606a}svg{max-width:100%;height:auto}a{color:#1e7f86}@media print{a.csv{display:none}h2{break-after:avoid}}
</style></head><body>
<h1>Despiece · ${escXml(title)}</h1>
<p class="muted">Medidas en milímetros, largo x ancho. El largo sigue la veta. Cantos marcados con X llevan tapacanto.</p>
<h2>Para comprar</h2><ul>${totals}<li><strong>${Math.ceil(edgeMeters * 1.1)}</strong> m de tapacanto (incluye 10 % de reserva)</li></ul>
${plan.oversize.length ? `<p style="color:#8c1d18">Piezas que no caben en un tablero: ${escXml(plan.oversize.map((o) => o.name).join(", "))}.</p>` : ""}
<h2>Lista de piezas</h2>${table}
<p><a class="csv" download="despiece.csv" href="data:text/csv;charset=utf-8,${encodeURIComponent(csv)}">Descargar la lista como CSV</a></p>
<h2>Plano de corte</h2>${cutPlanSvg(plan)}
</body></html>
`;
}
