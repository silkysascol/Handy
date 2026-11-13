import type { FurnitureModel, HardwareItem, Joinery } from "./model/index.js";
import { panelBox, panelInstances, type AABB } from "./collision.js";

/**
 * Instrucciones de armado generadas desde el modelo: en qué orden entran las piezas, con qué herrajes
 * y herramientas, y un dibujo isométrico de líneas por paso (las piezas nuevas se muestran separadas,
 * con una flecha hacia su lugar), al estilo de los manuales de muebles para armar.
 */
export interface AssemblyPart {
  /** Letra con la que la pieza aparece en los dibujos y en el inventario. */
  letter: string;
  id: string;
  name: string;
  qty: number;
  /** Largo x ancho x espesor, o largo y perfil en piezas metálicas. */
  size: string;
}

export interface AssemblyStep {
  n: number;
  title: string;
  text: string;
  /** Ids de las piezas que entran en este paso. */
  partIds: string[];
  hardware: { name: string; qty: number }[];
  tools: string[];
  minutes: number;
  tip?: string;
  /** El dibujo muestra el mueble acostado sobre su costado izquierdo, como se arma la caja. */
  lying?: boolean;
}

export interface AssemblyPlan {
  parts: AssemblyPart[];
  hardware: HardwareItem[];
  steps: AssemblyStep[];
  tools: string[];
  minutes: number;
}

type Vec3 = [number, number, number];
interface Solid { id: string; box: AABB }

/** Todas las cajas del mueble (tableros, tubos y accesorios), cada una con el id de su pieza. */
function solids(model: FurnitureModel): Solid[] {
  const out: Solid[] = [];
  for (const p of model.panels) for (const u of panelInstances(p)) { const box = panelBox(p, u.placement); if (box) out.push({ id: p.id, box }); }
  for (const b of model.bars ?? []) for (const box of b.boxes) out.push({ id: b.id, box });
  for (const f of model.fixtures ?? []) out.push({ id: f.kind, box: f.box });
  return out;
}

const STRUCTURAL = ["confirmat", "cap", "cam-lock", "dowel", "pocket-screw", "glue"];
const JOINERY_TOOLS: Record<Joinery, string[]> = {
  confirmat: ["taladro con broca de 5 mm", "llave Allen de 4 mm"],
  minifix: ["destornillador de estrella"],
  dowel: ["mazo de goma", "prensas o sargentos"],
  "pocket-screw": ["taladro atornillador"],
};

export function buildAssemblyPlan(model: FurnitureModel): AssemblyPlan {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const parts: AssemblyPart[] = [];
  for (const p of model.panels) parts.push({ letter: letters[parts.length % letters.length], id: p.id, name: p.name, qty: p.qty, size: `${p.height} x ${p.width} x ${p.thickness} mm` });
  for (const b of model.bars ?? []) parts.push({ letter: letters[parts.length % letters.length], id: b.id, name: b.name, qty: b.qty, size: `${b.length} mm · ${b.profileId.replace("tubo-", "tubo ")}` });
  for (const f of model.fixtures ?? []) if (!parts.some((x) => x.id === f.kind)) parts.push({ letter: letters[parts.length % letters.length], id: f.kind, name: f.name, qty: (model.fixtures ?? []).filter((x) => x.kind === f.kind).length, size: `${f.box.max[0] - f.box.min[0]} mm` });

  const has = (id: string) => parts.some((p) => p.id === id);
  const left = new Map(model.hardware.map((h) => [h.id, h.qty]));
  /** Toma herrajes por categoría; `share` reparte los estructurales entre los pasos según sus uniones. */
  const take = (categories: string[], share = 1, ids?: string[]): AssemblyStep["hardware"] => {
    const out: AssemblyStep["hardware"] = [];
    for (const h of model.hardware) {
      if (!categories.includes(h.category) || (ids && !ids.includes(h.id))) continue;
      const remaining = left.get(h.id) ?? 0;
      const qty = share >= 1 ? remaining : Math.min(remaining, Math.round(h.qty * share));
      if (qty <= 0) continue;
      left.set(h.id, remaining - qty);
      out.push({ name: h.name, qty });
    }
    return out;
  };
  const steps: AssemblyStep[] = [];
  const add = (s: Omit<AssemblyStep, "n">) => { if (s.partIds.length || s.hardware.length || s.text) steps.push({ n: steps.length + 1, ...s }); };

  if (model.bars?.length) {
    // Estructura de tubo.
    const meta = (model.meta ?? {}) as { joint?: string };
    const welded = meta.joint !== "bolt";
    const joinTools = welded ? ["soldadora", "careta y guantes", "pulidora", "escuadra magnética"] : ["taladro atornillador", "llave o copa para autoperforantes", "escuadra"];
    const join = (share: number) => take(welded ? ["welding-rod"] : ["tube-connector", "self-drilling-screw"], share);
    add({ title: "Arma los dos marcos laterales", text: `Sobre una superficie plana, une cada par de patas con sus travesaños cortos. ${welded ? "Puntea primero, comprueba la escuadra y luego suelda." : "Atornilla sin apretar del todo hasta comprobar la escuadra."}`, partIds: ["post", "rail-short"], hardware: join(0.5), tools: joinTools, minutes: 40, tip: "Mide las dos diagonales de cada marco: si son iguales, está a escuadra." });
    add({ title: "Une los marcos con los travesaños largos", text: `Para los marcos y únelos con los travesaños largos, de abajo hacia arriba. ${welded ? "Puntea todo antes de soldar definitivo para que no se tuerza." : "Aprieta todo al final, en cruz."}`, partIds: ["rail-long"], hardware: join(1), tools: joinTools, minutes: 45 });
    add({ title: "Limpia y pinta", text: `${welded ? "Pule las soldaduras. " : ""}Desengrasa, aplica anticorrosivo y dos manos de pintura. Pon los regatones en las patas.`, partIds: [], hardware: take(["paint-m2", "tube-cap"]), tools: ["lija o disco flap", "brocha o pistola"], minutes: 60 });
    if (has("deck")) add({ title: model.panels[0].qty > 1 ? "Fija los entrepaños" : "Fija la cubierta", text: "Apoya el tablero sobre el marco y atorníllalo desde abajo, a través de los travesaños.", partIds: ["deck"], hardware: take(["screw"]), tools: ["taladro atornillador", "broca para metal de 4,5 mm"], minutes: 15 * model.panels[0].qty, tip: "Haz el agujero del tubo un poco más grande que el tornillo: la madera se mueve con la humedad." });
    if (model.dims.height > 4 * Math.min(model.dims.width, model.dims.depth)) add({ title: "Fíjala al muro", text: "Es alta y angosta: sujétala al muro con dos escuadras en la parte de arriba para que no se vuelque.", partIds: [], hardware: [], tools: ["taladro", "chazos y tornillos según el muro"], minutes: 15 });
  } else {
    const jt = JOINERY_TOOLS[model.joinery];
    const params = (model.meta?.params ?? {}) as { plinthHeight?: number; dividers?: number; drawers?: number; doors?: number };
    const dividers = params.dividers ?? 0;
    const inner = ["divider", "shelf-fixed", "shelf-top"].filter(has);
    const innerJoints = 2 * dividers + (has("shelf-fixed") ? 2 : 0) + 2 * (parts.find((p) => p.id === "shelf-top")?.qty ?? 0);
    const plinthJoints = has("plinth") ? 2 : 0;
    const totalJoints = 4 + plinthJoints + innerJoints;
    const how = model.joinery === "minifix" ? "Enrosca los pernos en el costado, encaja la pieza y gira cada excéntrica un cuarto de vuelta." : model.joinery === "confirmat" ? "Presenta la pieza a escuadra, perfora y atornilla los confirmat." : model.joinery === "dowel" ? "Pon cola en los tarugos, encaja y prensa hasta que seque." : "Atornilla desde el interior por los agujeros inclinados.";
    add({ title: "Une el piso y el techo al costado izquierdo", text: `Acuesta el costado izquierdo con la ranura del fondo hacia arriba. ${how}`, partIds: ["side-left", "bottom", "top", ...(has("plinth") ? ["plinth"] : [])], hardware: take(STRUCTURAL, (2 + plinthJoints / 2) / totalJoints), tools: jt, minutes: 20, lying: true, tip: "El canto con tapacanto va siempre hacia el frente." });
    if (inner.length) add({ title: dividers ? "Coloca las divisiones y los entrepaños fijos" : "Coloca los entrepaños fijos", text: "Bajan entre el piso y el techo, con el canto enchapado hacia el frente. Únelos igual que en el paso anterior.", partIds: inner, hardware: take(STRUCTURAL, innerJoints / totalJoints), tools: jt, minutes: 10 * inner.length + 5 * dividers, lying: true });
    add({ title: "Desliza el fondo en la ranura", text: "El fondo baja por el lado que aún está abierto, dentro de la ranura del piso, del techo y del costado.", partIds: ["back"], hardware: [], tools: [], minutes: 5, lying: true, tip: "Si no corre, revisa que la ranura esté limpia. No lo fuerces." });
    add({ title: "Cierra la caja con el costado derecho", text: `Encaja el costado derecho sobre el piso, el techo y el fondo. ${model.joinery === "minifix" ? "Gira las excéntricas un cuarto de vuelta." : "Fíjalo igual que el izquierdo."} Para el mueble y comprueba la escuadra midiendo las dos diagonales.`, partIds: ["side-right"], hardware: [...take(STRUCTURAL), ...take(["screw"], 1, ["back-screw"])], tools: [...jt, "metro"], minutes: 15, lying: true });
    if (has("shelf")) add({ title: "Pon las repisas", text: "Mete cuatro soportes por repisa a la misma altura y apoya cada repisa encima.", partIds: ["shelf"], hardware: take(["shelf-pin"]), tools: [], minutes: 3 * (parts.find((p) => p.id === "shelf")?.qty ?? 1) });
    if (has("rod")) add({ title: "Monta la barra de colgar", text: "Atornilla un soporte a cada lado, a la misma altura bajo el maletero, y encaja el tubo.", partIds: ["rod"], hardware: take(["closet-rod", "rod-support"]), tools: ["destornillador de estrella", "nivel"], minutes: 10 });
    if (has("drawer-side")) add({ title: "Arma y monta los cajones", text: "Arma cada cajón: dos costados, frente interior, trasera y el fondo clavado por debajo. Atornilla una parte de la corredera al mueble y la otra al cajón, y deslízalo hasta que enganche.", partIds: ["drawer-side", "drawer-end", "drawer-bottom", ...(has("drawer-front") ? ["drawer-front"] : [])], hardware: [...take(["slide"]), ...take(["screw"], 1, ["drawer-screw"]), ...(has("drawer-front") ? take(["handle"], (params.drawers ?? 0) / ((params.drawers ?? 0) + (params.doors ?? 0) || 1)) : [])], tools: ["destornillador de estrella", "escuadra"], minutes: 20 * (params.drawers ?? 1), tip: "Las dos correderas de un cajón deben quedar a la misma altura y a la misma distancia del frente." });
    if (has("door")) add({ title: "Cuelga las puertas", text: "Presiona cada bisagra en su cazoleta y atorníllala. Engancha la puerta en las bases del costado y regula con los tornillos de la bisagra hasta que las luces queden parejas.", partIds: ["door"], hardware: take(["hinge", "handle"]), tools: ["destornillador de estrella"], minutes: 10 * (params.doors ?? 1) });
    const rest = take(["foot"]);
    const tall = model.dims.height > 1200;
    if (rest.length || tall) add({ title: tall ? "Nivela y fija al muro" : "Nivela", text: `${rest.length ? "Regula las patas hasta que el mueble quede a nivel. " : ""}${tall ? "Sujétalo al muro por arriba con dos escuadras: un mueble alto cargado puede volcarse." : ""}`.trim(), partIds: [], hardware: rest, tools: tall ? ["nivel", "taladro", "chazos y tornillos según el muro"] : ["nivel"], minutes: 10 });
  }
  // Lo que no quedó asignado a ningún paso se entrega con el último, para que el inventario cuadre.
  const leftovers = model.hardware.filter((h) => (left.get(h.id) ?? 0) > 0).map((h) => ({ name: h.name, qty: left.get(h.id)! }));
  if (leftovers.length && steps.length) steps[steps.length - 1].hardware.push(...leftovers);

  const tools = [...new Set(steps.flatMap((s) => s.tools))];
  return { parts, hardware: model.hardware, steps, tools, minutes: steps.reduce((a, s) => a + s.minutes, 0) };
}

// ---------- Dibujo isométrico de líneas ----------

/** Desde dónde llega cada pieza a su lugar (mm), para dibujarla separada con una flecha. */
const ARRIVES_FROM: Record<string, Vec3> = {
  bottom: [260, 0, 0], top: [260, 0, 0], plinth: [260, 0, 0], divider: [0, 0, 420], "shelf-fixed": [0, 0, 420], "shelf-top": [0, 0, 420],
  back: [420, 0, 0], "side-right": [320, 0, 0], shelf: [0, 0, 420], rod: [0, 0, 420],
  "drawer-side": [0, 0, 480], "drawer-end": [0, 0, 480], "drawer-bottom": [0, 0, 480], "drawer-front": [0, 0, 480], door: [0, 0, 320], deck: [0, 280, 0],
};

const C = Math.cos(Math.PI / 6), S = 0.5;
/** Proyección isométrica: el observador está delante, arriba y a la derecha. */
const iso = ([x, y, z]: Vec3): [number, number] => [(x - z) * C, (x + z) * S - y];

/** Orden de pintado de atrás hacia adelante para cajas que no se cruzan. */
function paintOrder(items: Solid[]): Solid[] {
  // Mirando desde +x +y +z, `a` no puede tapar a `b` si queda del todo detrás en algún eje.
  // Si ninguna puede tapar a la otra (o se cruzan) no hay restricción: forzarla crearía ciclos.
  const behind = (a: AABB, b: AABB): boolean | null => {
    const aCant = [0, 1, 2].some((k) => a.max[k] <= b.min[k] + 0.5);
    const bCant = [0, 1, 2].some((k) => b.max[k] <= a.min[k] + 0.5);
    return aCant === bCant ? null : aCant;
  };
  const n = items.length;
  const after: number[][] = Array.from({ length: n }, () => []);
  const pending = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const r = behind(items[i].box, items[j].box);
    if (r === true) { after[i].push(j); pending[j]++; } else if (r === false) { after[j].push(i); pending[i]++; }
  }
  const depth = (s: Solid) => s.box.min[0] + s.box.min[1] + s.box.min[2] + s.box.max[0] + s.box.max[1] + s.box.max[2];
  const ready = items.map((_, i) => i).filter((i) => pending[i] === 0).sort((a, b) => depth(items[a]) - depth(items[b]));
  const out: Solid[] = [];
  const done = new Set<number>();
  while (ready.length) {
    const i = ready.shift()!;
    out.push(items[i]); done.add(i);
    for (const j of after[i]) if (--pending[j] === 0) { ready.push(j); ready.sort((a, b) => depth(items[a]) - depth(items[b])); }
  }
  // Si quedara un ciclo, el resto se pinta por profundidad.
  for (const i of items.map((_, k) => k).filter((k) => !done.has(k)).sort((a, b) => depth(items[a]) - depth(items[b]))) out.push(items[i]);
  return out;
}

/**
 * Dibujo de un paso: lo ya armado en gris, las piezas del paso en negro y separadas de su lugar,
 * con una flecha y su letra. Con `stepIndex` omitido dibuja el mueble terminado.
 */
export function assemblySvg(model: FurnitureModel, plan: AssemblyPlan, stepIndex?: number): string {
  const all = solids(model);
  const stepOf = new Map<string, number>();
  plan.steps.forEach((s, i) => s.partIds.forEach((id) => stepOf.set(id, i)));
  const final = stepIndex === undefined;
  const current = final ? new Set<string>() : new Set(plan.steps[stepIndex!].partIds);
  const isFirst = !final && stepIndex === 0;
  const lying = !final && !!plan.steps[stepIndex!].lying;
  const tall = model.dims.height;
  /** Acostado sobre el costado izquierdo: lo que era ancho pasa a ser altura. */
  const lay = (b: AABB): AABB => ({ min: [tall - b.max[1], b.min[0], b.min[2]], max: [tall - b.min[1], b.max[0], b.max[2]] });
  const scene: (Solid & { fresh: boolean; from?: Vec3 })[] = [];
  for (const s of all) {
    const at = stepOf.get(s.id);
    if (!final && (at === undefined || at > stepIndex!)) continue;
    const fresh = current.has(s.id);
    // La primera pieza del primer paso es la base y no se separa.
    const natural = fresh && !(isFirst && s.id === plan.steps[0].partIds[0]) ? ARRIVES_FROM[s.id] : undefined;
    // Acostado, todo baja desde arriba: es el único lado abierto de la caja.
    const d: Vec3 | undefined = natural && lying ? [Math.max(...natural), 0, 0] : natural;
    const moved: AABB = d ? { min: [s.box.min[0] + d[0], s.box.min[1] + d[1], s.box.min[2] + d[2]], max: [s.box.max[0] + d[0], s.box.max[1] + d[1], s.box.max[2] + d[2]] } : s.box;
    scene.push({ id: s.id, fresh, from: d && lying ? [-d[1], d[0], d[2]] : d, box: lying ? lay(moved) : moved });
  }
  if (!scene.length) return "";
  const ordered = paintOrder(scene) as typeof scene;

  const pts: [number, number][] = [];
  for (const s of scene) for (const x of [s.box.min[0], s.box.max[0]]) for (const y of [s.box.min[1], s.box.max[1]]) for (const z of [s.box.min[2], s.box.max[2]]) pts.push(iso([x, y, z]));
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0])), minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  const W = 760, H = 520, pad = 36;
  const k = Math.min((W - 2 * pad) / Math.max(maxX - minX, 1), (H - 2 * pad) / Math.max(maxY - minY, 1));
  const ox = pad + ((W - 2 * pad) - (maxX - minX) * k) / 2 - minX * k, oy = pad + ((H - 2 * pad) - (maxY - minY) * k) / 2 - minY * k;
  const P = (v: Vec3) => { const [x, y] = iso(v); return `${(x * k + ox).toFixed(1)},${(y * k + oy).toFixed(1)}`; };
  const letterOf = new Map(plan.parts.map((p) => [p.id, p.letter]));

  const body: string[] = [];
  const labels: string[] = [];
  const labelled = new Set<string>();
  const placed: [number, number][] = [];
  for (const s of ordered) {
    const { min: a, max: b } = s.box;
    const stroke = final || s.fresh ? "#111" : "#9aa0a6", sw = s.fresh ? 2 : final ? 1.3 : 1;
    const face = (q: Vec3[], fill: string) => `<polygon points="${q.map(P).join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
    body.push(face([[a[0], b[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]], "#ffffff")); // arriba
    body.push(face([[b[0], a[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]], [b[0], a[1], b[2]]], s.fresh || final ? "#f1f1ef" : "#f7f7f6")); // derecha
    body.push(face([[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]], s.fresh || final ? "#e6e6e3" : "#f2f2f0")); // frente
    if (s.fresh && !labelled.has(s.id)) {
      labelled.add(s.id);
      const c: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      let [lx, ly] = P([b[0], b[1], b[2]]).split(",").map(Number);
      lx += 16; ly -= 12;
      // Dos letras no se pisan: la segunda sube hasta quedar libre.
      while (placed.some(([x, y]) => Math.hypot(x - lx, y - ly) < 30)) ly -= 30;
      placed.push([lx, ly]);
      if (s.from) {
        const to: Vec3 = [c[0] - s.from[0] * 0.8, c[1] - s.from[1] * 0.8, c[2] - s.from[2] * 0.8];
        labels.push(`<line x1="${P(c).split(",")[0]}" y1="${P(c).split(",")[1]}" x2="${P(to).split(",")[0]}" y2="${P(to).split(",")[1]}" stroke="#111" stroke-width="2.5" stroke-dasharray="7 5" marker-end="url(#arrow)"/>`);
      }
      labels.push(`<circle cx="${lx}" cy="${ly}" r="13" fill="#fff" stroke="#111" stroke-width="2"/><text x="${lx}" y="${ly + 5}" font-size="15" font-weight="700" text-anchor="middle">${letterOf.get(s.id) ?? "?"}</text>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif" fill="#111"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#111"/></marker></defs><rect width="100%" height="100%" fill="#fff"/>${body.join("")}${labels.join("")}</svg>`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Manual de armado imprimible: portada con el mueble terminado, inventario de piezas y herrajes, y un paso por bloque. */
export function assemblyHtml(model: FurnitureModel, title: string): string {
  const plan = buildAssemblyPlan(model);
  const hours = plan.minutes >= 60 ? `${Math.floor(plan.minutes / 60)} h ${plan.minutes % 60 ? `${plan.minutes % 60} min` : ""}`.trim() : `${plan.minutes} min`;
  const steps = plan.steps.map((s, i) => `<section class="step"><div class="n">${s.n}</div><div class="c"><h2>${esc(s.title)}</h2>${s.partIds.length ? assemblySvg(model, plan, i) : ""}<p>${esc(s.text)}</p>${s.tip ? `<p class="tip">${esc(s.tip)}</p>` : ""}
<div class="chips">${s.partIds.map((id) => plan.parts.find((p) => p.id === id)).filter(Boolean).map((p) => `<span class="chip"><b>${p!.letter}</b> ${esc(p!.name)} × ${p!.qty}</span>`).join("")}${s.hardware.map((h) => `<span class="chip hw">${esc(h.name)} × ${h.qty}</span>`).join("")}</div>
${s.tools.length ? `<p class="tools">Herramientas: ${esc(s.tools.join(", "))}.</p>` : ""}</div></section>`).join("\n");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Armado · ${esc(title)}</title><style>
body{font:14px/1.45 Helvetica,Arial,sans-serif;color:#111;margin:28px auto;max-width:860px;padding:0 20px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:0 0 8px}
.muted{color:#56606a}table{border-collapse:collapse;width:100%;margin:6px 0 18px}th,td{border:1px solid #c9ced3;padding:5px 8px;text-align:left;font-size:13px}th{background:#f1f2f4}td.l{font-weight:700;text-align:center;width:36px}td.n{font-family:monospace}
svg{max-width:100%;height:auto;display:block;margin:4px 0 8px}.step{display:flex;gap:16px;border-top:2px solid #111;padding:18px 0;break-inside:avoid}.step .n{flex:0 0 56px;height:56px;border:3px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700}
.step .c{flex:1;min-width:0}.tip{border-left:4px solid #111;padding:4px 10px;background:#f6f6f4}.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.chip{border:1.5px solid #111;border-radius:99px;padding:2px 10px;font-size:12.5px}.chip.hw{border-style:dashed}.tools{color:#56606a;font-size:13px}
@media print{body{margin:0}.step{break-inside:avoid}}
</style></head><body>
<h1>${esc(title)}</h1>
<p class="muted">${model.dims.width} x ${model.dims.height} x ${model.dims.depth} mm · ${plan.steps.length} pasos · unas ${hours} · ${model.bars?.length ? "estructura de tubo" : model.joinery === "minifix" || model.joinery === "dowel" ? "sin tornillos a la vista" : `unión ${model.joinery}`}</p>
${assemblySvg(model, plan)}
<h2>Antes de empezar</h2>
<p>Revisa que estén todas las piezas y herrajes. Trabaja sobre una superficie plana y limpia, con una manta o cartón para no rayar. Herramientas: ${esc(plan.tools.join(", ") || "ninguna especial")}.</p>
<h2>Piezas</h2>
<table><thead><tr><th></th><th>Pieza</th><th>Cant.</th><th>Medida</th></tr></thead><tbody>${plan.parts.map((p) => `<tr><td class="l">${p.letter}</td><td>${esc(p.name)}</td><td class="n">${p.qty}</td><td class="n">${esc(p.size)}</td></tr>`).join("")}</tbody></table>
<h2>Herrajes</h2>
<table><thead><tr><th>Herraje</th><th>Cant.</th></tr></thead><tbody>${plan.hardware.map((h) => `<tr><td>${esc(h.name)}</td><td class="n">${h.qty}</td></tr>`).join("")}</tbody></table>
${steps}
</body></html>
`;
}
