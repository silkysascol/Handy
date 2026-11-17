import type { FurnitureModel, Panel } from "./model/index.js";

/**
 * Esquinas redondeadas: la tienda corta la pieza rectangular y el redondeo se hace en casa.
 * Aquí está qué piezas lo llevan y la plantilla del radio a tamaño real para marcarlo.
 */
export interface RoundedPiece { id: string; name: string; qty: number; radius: number; corners: 2 | 4; length: number; width: number }

export function roundedPieces(model: FurnitureModel): RoundedPiece[] {
  return model.panels.filter((p): p is Panel & { cornerRadius: number } => !!p.cornerRadius).map((p) => ({ id: p.id, name: p.name, qty: p.qty, radius: p.cornerRadius, corners: p.roundedCorners === "all" ? 4 : 2, length: p.height, width: p.width }));
}

/**
 * Plantilla de una esquina a tamaño real (las medidas del SVG van en milímetros): se imprime al 100 %,
 * se recorta por el arco y se apoya contra los dos cantos de la esquina. Trae una regla de 100 mm para
 * comprobar que la impresora no cambió la escala.
 */
export function cornerTemplateSvg(radius: number): string {
  // El papel es un cuadrado con dos orejas de 20 mm que siguen los cantos de la pieza: esas orejas son las que lo alinean.
  const m = 12, ext = 20, r = radius;
  const x0 = m, y0 = m, cx = m + ext, cy = m + ext, x1 = cx + r, y1 = cy + r;
  const w = Math.max(x1 + m, 100 + 2 * m), h = y1 + 26;
  const f = Math.max(3, Math.min(6, r / 10));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif" fill="#111">
<rect width="${w}" height="${h}" fill="#fff"/>
<path d="M${x1} ${cy}A${r} ${r} 0 0 1 ${cx} ${y1}L${x1} ${y1}Z" fill="#e3e3e0" stroke="#111" stroke-width="0.25" stroke-dasharray="1.5 1.2"/>
<path d="M${x0} ${y0}H${x1}V${cy}A${r} ${r} 0 0 1 ${cx} ${y1}H${x0}Z" fill="#fff" stroke="#111" stroke-width="0.7" stroke-linejoin="round"/>
<path d="M${x1 + 1.5} ${y0}v${ext}M${x0} ${y1 + 1.5}h${ext}" stroke="#111" stroke-width="1.6"/>
<text x="${cx + r * 0.36}" y="${cy + r * 0.42}" font-size="${f + 1}" font-weight="700" text-anchor="middle">R ${r}</text>
<text x="${x0 + 2}" y="${y0 + 6}" font-size="3">Recorta por la línea gruesa.</text>
<text x="${x0 + 2}" y="${y0 + 11}" font-size="3">Los dos tramos marcados van</text>
<text x="${x0 + 2}" y="${y0 + 15}" font-size="3">a ras de los cantos.</text>
<text x="${x1 - 2}" y="${y1 - 2}" font-size="3" text-anchor="end" fill="#56606a">esto se corta</text>
<path d="M${m} ${h - 9}h100M${m} ${h - 11}v4M${m + 50} ${h - 10.5}v3M${m + 100} ${h - 11}v4" stroke="#111" stroke-width="0.35" fill="none"/>
<text x="${m}" y="${h - 3}" font-size="3">Esta línea debe medir 100 mm. Si no, imprime al 100 %, sin ajustar a la página.</text>
</svg>`;
}

/** Sección para el despiece: qué redondear y las plantillas. Vacía si el mueble no lleva esquinas redondeadas. */
export function roundingSection(model: FurnitureModel): string {
  const pieces = roundedPieces(model);
  if (!pieces.length) return "";
  const radii = [...new Set(pieces.map((p) => p.radius))].sort((a, b) => a - b);
  return `<h2>Esquinas redondeadas</h2>
<p>Estas piezas se piden <strong>rectangulares</strong> en la tienda y se redondean en casa: recorta la plantilla por su línea gruesa, apóyala en la esquina con sus dos tramos rectos cortos a ras de los cantos y marca el arco con lápiz; corta con caladora dejando 2 mm por fuera de la línea y llega a ella con lija en taco o con router y broca de copiar. Luego pega el tapacanto: en la curva pide tapacanto de PVC delgado (0,45 mm), que dobla sin romperse.</p>
<ul>${pieces.map((p) => `<li><strong>${p.name}</strong>${p.qty > 1 ? ` × ${p.qty}` : ""}: ${p.corners === 4 ? "las 4 esquinas" : "las 2 esquinas del frente"} a R${p.radius} mm</li>`).join("")}</ul>
${radii.map((r) => `<h3>Plantilla R${r} mm, tamaño real</h3>${cornerTemplateSvg(r)}`).join("\n")}`;
}
