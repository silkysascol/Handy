import type { FurnitureModel, HardwareItem, Joinery } from "./model/index.js";
import { panelBox, panelInstances, type AABB } from "./collision.js";
import { computeJoints, drillSheets, drillSheetSvg, type Fastening, type JointSet } from "./joints.js";

/**
 * Instrucciones de armado generadas desde el modelo: en qué orden entran las piezas, con qué herrajes
 * y herramientas, dónde va cada herraje y qué comprobar. Tres niveles de detalle:
 *   - guiado: una pieza por paso, con cada acción escrita y las medidas de cada herraje. Para quien nunca ha armado.
 *   - normal: los pasos de un manual de mueble para armar.
 *   - experto: tres o cuatro pasos con lo esencial.
 */
export type AssemblyLevel = "guided" | "normal" | "expert";
export const ASSEMBLY_LEVELS: { id: AssemblyLevel; name: string; hint: string }[] = [
  { id: "guided", name: "Guiado", hint: "Una pieza por paso, con cada acción y cada medida. Para tu primer mueble." },
  { id: "normal", name: "Normal", hint: "Los pasos de un manual de mueble para armar." },
  { id: "expert", name: "Experto", hint: "Solo el orden y las cantidades." },
];

export interface AssemblyPart {
  /** Letra con la que la pieza aparece en los dibujos y en el inventario. */
  letter: string;
  id: string;
  name: string;
  qty: number;
  /** Largo x ancho x espesor, o largo y perfil en piezas metálicas. */
  size: string;
}

type Vec3 = [number, number, number];

export interface AssemblyStep {
  n: number;
  title: string;
  /** Resumen del paso en una o dos frases. */
  text: string;
  /** Acciones en orden, una por renglón. En el nivel experto va vacío. */
  actions: string[];
  /** Qué comprobar antes de seguir. */
  checks: string[];
  /** Ids de las piezas que entran en este paso. */
  partIds: string[];
  hardware: { name: string; qty: number }[];
  tools: string[];
  minutes: number;
  tip?: string;
  /** El dibujo muestra el mueble acostado sobre su costado izquierdo, como se arma la caja. */
  lying?: boolean;
  /** Puntos del mueble donde van los herrajes de este paso (mm), para señalarlos. */
  points: Vec3[];
}

export interface AssemblyPlan {
  level: AssemblyLevel;
  parts: AssemblyPart[];
  hardware: HardwareItem[];
  steps: AssemblyStep[];
  tools: string[];
  minutes: number;
}

interface Solid { id: string; box: AABB }

/** Todas las cajas del mueble (tableros, tubos y accesorios), cada una con el id de su pieza. */
function solids(model: FurnitureModel): Solid[] {
  const out: Solid[] = [];
  for (const p of model.panels) for (const u of panelInstances(p)) { const box = panelBox(p, u.placement); if (box) out.push({ id: p.id, box }); }
  for (const b of model.bars ?? []) for (const box of b.boxes) out.push({ id: b.id, box });
  for (const f of model.fixtures ?? []) out.push({ id: f.kind, box: f.box });
  return out;
}

const JOINERY_TOOLS: Record<Joinery, string[]> = {
  confirmat: ["taladro con broca de 5 mm", "llave Allen de 4 mm"],
  minifix: ["destornillador de estrella"],
  dowel: ["mazo de goma", "prensas o sargentos"],
  "pocket-screw": ["taladro atornillador"],
};

/** Operación mínima de armado. Los niveles las muestran una a una o agrupadas. */
interface Op {
  group: string;
  phase: "caja" | "interior" | "frentes" | "final";
  title: string;
  /** Frase para el nivel normal. */
  brief: string;
  /** Media frase para el nivel experto. */
  short: string;
  detail: string[];
  checks: string[];
  partIds: string[];
  hardware: { name: string; qty: number }[];
  tools: string[];
  minutes: number;
  tip?: string;
  lying?: boolean;
  points: Vec3[];
  /** Solo aparece en el nivel guiado. */
  guidedOnly?: boolean;
}

const GROUP_TITLE: Record<string, string> = {
  caja: "Une el piso y el techo al costado izquierdo", fijos: "Coloca las divisiones y los entrepaños fijos", fondo: "Desliza el fondo en la ranura",
  cierre: "Cierra la caja con el costado derecho", repisas: "Pon las repisas", barra: "Monta la barra de colgar", cajones: "Arma y monta los cajones",
  puertas: "Cuelga las puertas", final: "Nivela y fija al muro",
  marcos: "Arma los dos marcos laterales", largos: "Une los marcos con los travesaños largos", pintura: "Limpia y pinta", cubierta: "Fija la cubierta",
};
const PHASE_TITLE: Record<Op["phase"], string> = { caja: "Arma la caja", interior: "Monta el interior", frentes: "Pon los frentes", final: "Nivela y fija" };

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const sumHardware = (xs: { name: string; qty: number }[]) => { const m = new Map<string, number>(); for (const h of xs) m.set(h.name, (m.get(h.name) ?? 0) + h.qty); return [...m].map(([name, qty]) => ({ name, qty })); };

function buildOps(model: FurnitureModel, parts: AssemblyPart[], joints: JointSet): Op[] {
  const has = (id: string) => parts.some((p) => p.id === id);
  /** "puerta (H)": el nombre de la pieza con su letra. */
  const N = (id: string) => { const p = parts.find((x) => x.id === id); return p ? `${p.name.toLowerCase().replace(/ \(par\)$/, "")} (${p.letter})` : id; };
  /** "la puerta (H)": con artículo, para usar dentro de una frase. */
  const L = (id: string) => `${/^(divisi|repisa|puerta|barra|trasera|pata|cubierta|tapa)/.test(N(id)) ? "la" : "el"} ${N(id)}`;
  /** "H (puerta)": para contar piezas sin pelear con los plurales. */
  const P = (id: string) => { const p = parts.find((x) => x.id === id); return p ? `${p.letter} (${p.name.toLowerCase().replace(/ \(par\)$/, "")})` : id; };
  const qtyOf = (id: string) => parts.find((p) => p.id === id)?.qty ?? 0;
  const left = new Map(model.hardware.map((h) => [h.id, h.qty]));
  const takeId = (id: string, qty = Infinity): Op["hardware"] => {
    const h = model.hardware.find((x) => x.id === id);
    const n = Math.min(left.get(id) ?? 0, qty);
    if (!h || n <= 0) return [];
    left.set(id, (left.get(id) ?? 0) - n);
    return [{ name: h.name, qty: n }];
  };
  const take = (categories: string[], share = 1): Op["hardware"] => model.hardware.filter((h) => categories.includes(h.category)).flatMap((h) => takeId(h.id, share >= 1 ? Infinity : Math.round(h.qty * share)));
  const ops: Op[] = [];
  const op = (o: Partial<Op> & Pick<Op, "group" | "phase" | "title" | "brief" | "short">) => ops.push({ detail: [], checks: [], partIds: [], hardware: [], tools: [], minutes: 5, points: [], ...o });

  if (model.bars?.length) {
    const meta = (model.meta ?? {}) as { joint?: string };
    const welded = meta.joint !== "bolt";
    const joinTools = welded ? ["soldadora", "careta y guantes", "pulidora", "escuadra magnética"] : ["taladro atornillador", "llave o copa para autoperforantes", "escuadra"];
    const join = (share: number) => take(welded ? ["welding-rod"] : ["tube-connector", "self-drilling-screw"], share);
    op({ group: "preparar", phase: "caja", guidedOnly: true, title: "Revisa los cortes", brief: "", short: "", minutes: 10,
      detail: ["Compara cada tubo con la lista: mide el largo y márcalo con su letra.", "Lima la rebaba de cada corte: un corte limpio suelda y asienta mejor.", welded ? "Limpia con lija o disco los 3 cm de cada punta: la soldadura no agarra sobre óxido, grasa ni pintura." : "Marca con un punzón dónde va cada tornillo, para que la broca no resbale.", "Trabaja sobre una mesa o un piso plano: lo que se arma torcido queda torcido."],
      checks: ["Las patas miden exactamente lo mismo entre sí."], tools: ["metro", "lima", "marcador"] });
    op({ group: "marcos", phase: "caja", title: "Arma los dos marcos laterales", partIds: ["post", "rail-short"], hardware: join(0.5), tools: joinTools, minutes: 40,
      brief: `Sobre una superficie plana, une cada par de patas con sus travesaños cortos. ${welded ? "Puntea primero, comprueba la escuadra y luego suelda." : "Atornilla sin apretar del todo hasta comprobar la escuadra."}`,
      short: "marcos laterales (patas y travesaños cortos)",
      detail: [`Acuesta dos piezas ${P("post")} paralelas sobre la mesa.`, `Pon entre ellas las piezas ${P("rail-short")}, a ras con las puntas y en los niveles intermedios.`, "Sujeta cada esquina con la escuadra magnética o con una prensa.", welded ? "Da un punto de soldadura en cada unión. No sueldes corrido todavía." : "Pon un conector en cada esquina y un tornillo por cara, sin apretar del todo.", "Mide las dos diagonales del marco y corrige a golpes suaves hasta que sean iguales.", welded ? "Suelda cada unión completa, alternando esquinas para que el calor no lo tuerza." : "Aprieta todos los tornillos.", "Repite para el segundo marco, armándolo encima del primero para que salgan idénticos."],
      checks: ["Las dos diagonales de cada marco miden lo mismo.", "Los dos marcos, uno sobre otro, coinciden."], tip: "Mide las dos diagonales de cada marco: si son iguales, está a escuadra." });
    op({ group: "largos", phase: "caja", title: "Une los marcos con los travesaños largos", partIds: ["rail-long"], hardware: join(1), tools: joinTools, minutes: 45,
      brief: `Para los marcos y únelos con los travesaños largos, de abajo hacia arriba. ${welded ? "Puntea todo antes de soldar definitivo para que no se tuerza." : "Aprieta todo al final, en cruz."}`,
      short: "travesaños largos entre los marcos",
      detail: ["Para los dos marcos, con ayuda de otra persona o apoyándolos contra un muro.", `Presenta las piezas ${P("rail-long")} de abajo y sujétalas con prensas.`, welded ? "Puntea las cuatro uniones de abajo." : "Atornilla las cuatro uniones de abajo sin apretar.", "Sube nivel por nivel hasta arriba, igual.", "Comprueba que no cojea y que las diagonales de arriba son iguales.", welded ? "Suelda definitivo, alternando lados." : "Aprieta todo, en cruz."],
      checks: ["Apoyada en el piso, no cojea.", "Las diagonales de la cara de arriba son iguales."] });
    op({ group: "pintura", phase: "interior", title: "Limpia y pinta", hardware: take(["paint-m2", "tube-cap"]), tools: ["lija o disco flap", "brocha o pistola"], minutes: 60,
      brief: `${welded ? "Pule las soldaduras. " : ""}Desengrasa, aplica anticorrosivo y dos manos de pintura. Pon los regatones en las patas.`, short: "pulir, anticorrosivo, pintura y regatones",
      detail: [...(welded ? ["Pule las soldaduras con disco flap hasta que queden a ras."] : []), "Limpia toda la estructura con un trapo con thinner para quitar grasa.", "Da una mano de anticorrosivo y deja secar lo que diga el envase.", "Da dos manos de pintura, dejando secar entre una y otra.", "Mete un regatón en cada pata."],
      checks: ["No queda metal desnudo, tampoco por dentro de las uniones."] });
    if (has("deck")) op({ group: "cubierta", phase: "interior", title: model.panels[0].qty > 1 ? "Fija los entrepaños" : "Fija la cubierta", partIds: ["deck"], hardware: take(["screw"]), tools: ["taladro atornillador", "broca para metal de 4,5 mm"], minutes: 15 * model.panels[0].qty,
      brief: "Apoya el tablero sobre el marco y atorníllalo desde abajo, a través de los travesaños.", short: "tablero atornillado desde abajo",
      detail: ["Apoya el tablero centrado sobre los travesaños.", "Desde abajo, perfora el tubo con broca de 4,5 mm cada 30 cm, sin llegar a la madera.", "Atornilla desde abajo, a través del tubo, hasta que la cabeza asiente."],
      checks: ["El tablero sobresale lo mismo por todos los lados."], tip: "Haz el agujero del tubo un poco más grande que el tornillo: la madera se mueve con la humedad." });
    if (model.dims.height > 4 * Math.min(model.dims.width, model.dims.depth)) op({ group: "final", phase: "final", title: "Fíjala al muro", tools: ["taladro", "chazos y tornillos según el muro"], minutes: 15,
      brief: "Es alta y angosta: sujétala al muro con dos escuadras en la parte de arriba para que no se vuelque.", short: "dos escuadras al muro",
      detail: ["Ponla en su sitio y nivélala.", "Marca en el muro dos puntos a la altura del último travesaño.", "Perfora, mete los chazos y atornilla una escuadra en cada punto, unida al travesaño."], checks: ["Al tirar de arriba hacia ti, no se mueve."] });
  } else {
    const j = model.joinery;
    const jt = JOINERY_TOOLS[j];
    const params = (model.meta?.params ?? {}) as { drawers?: number; doors?: number };
    const placed = new Set<string>();
    const used = new Set<Fastening>();
    /** Uniones entre las piezas nuevas y lo que ya está puesto. */
    const jointsFor = (ids: string[]) => {
      const fs = joints.fastenings.filter((f) => f.kind === "structural" && !used.has(f) && (ids.includes(f.part) || ids.includes(f.into)) && [f.part, f.into].every((x) => placed.has(x) || ids.includes(x)));
      fs.forEach((f) => used.add(f));
      ids.forEach((x) => placed.add(x));
      return fs;
    };
    const structural = (n: number): Op["hardware"] => (j === "minifix" ? [...takeId("minifix-cam-15", n), ...takeId("minifix-bolt", n), ...takeId("dowel-8x30", n)] : j === "confirmat" ? [...takeId("confirmat-7x50", n), ...takeId("cap-confirmat", n)] : j === "dowel" ? [...takeId("dowel-8x35", 2 * n), ...takeId("pva-glue")] : takeId("pocket-screw-32", n));
    /** Las acciones de unir una pieza, según el sistema de unión, con la posición de cada herraje. */
    const joinDetail = (ids: string[], fs: Fastening[]): string[] => {
      const out: string[] = [];
      const name = list(ids.map(L));
      const byInto = new Map<string, Fastening[]>();
      for (const f of fs) { const other = ids.includes(f.part) ? f.into : f.part; byInto.set(`${other}|${f.into}|${f.intoInstance}`, [...(byInto.get(`${other}|${f.into}|${f.intoInstance}`) ?? []), f]); }
      const spots = [...byInto.values()].map((g) => `${g.reduce((a, f) => a + f.points.length, 0)} en ${L(g[0].into)}${qtyOf(g[0].into) > 1 ? ` n.º ${g[0].intoInstance + 1}` : ""}, ${g[0].where}`);
      if (j === "minifix") {
        out.push(`Enrosca los pernos minifix a mano y termina con el destornillador, sin forzar. Van ${spots.join("; ")}.`);
        out.push(`Mete un tarugo en cada agujero de 8 mm de los cantos, con un golpe suave. Debe quedar la mitad afuera.`);
        out.push(`Presenta ${name} sobre los pernos y los tarugos, con el canto enchapado hacia el frente, y empuja hasta que asiente sin luz.`);
        out.push(`Mete una excéntrica en cada cazoleta de 15 mm, con la flecha apuntando hacia el canto. Gírala en el sentido del reloj hasta que apriete: es más o menos media vuelta.`);
      } else if (j === "confirmat") {
        out.push(`Presenta ${name} a escuadra, con el canto enchapado hacia el frente. Sujeta con una prensa de esquina o pide ayuda.`);
        out.push(`Los tornillos van ${spots.join("; ")}.`);
        out.push("Por cada agujero pasante, perfora con broca de 5 mm unos 40 mm dentro del canto de la otra pieza, derecho.");
        out.push("Atornilla cada confirmat con la llave Allen hasta que la cabeza quede a ras. Si aprietas de más, el aglomerado se barre.");
        out.push("Tapa cada cabeza con su tapa plástica.");
      } else if (j === "dowel") {
        out.push(`Los tarugos van de a dos, 16 mm a cada lado de cada punto: ${spots.join("; ")}.`);
        out.push("Pon una gota de cola en cada agujero y un hilo fino a lo largo del canto.");
        out.push(`Mete los tarugos y encaja ${name} con golpes suaves de mazo, con el canto enchapado hacia el frente.`);
        out.push("Prensa la unión y limpia la cola que salga con un trapo húmedo. Déjala prensada 30 minutos.");
      } else {
        out.push(`Presenta ${name} a escuadra, con el canto enchapado hacia el frente y los agujeros inclinados hacia la cara que no se ve. Sujeta con una prensa.`);
        out.push("Atornilla por cada agujero inclinado hasta que la cabeza asiente. Si la pieza se corre al apretar, afloja, vuelve a alinear y prensa más fuerte.");
      }
      return out;
    };
    const joinBrief = j === "minifix" ? "Enrosca los pernos en la pieza que recibe, encaja la que llega y gira cada excéntrica hasta que apriete." : j === "confirmat" ? "Presenta la pieza a escuadra, perfora y atornilla los confirmat." : j === "dowel" ? "Pon cola en los tarugos, encaja y prensa hasta que seque." : "Atornilla desde la cara oculta por los agujeros inclinados.";
    const join = (ids: string[], o: Partial<Op> & Pick<Op, "group" | "phase" | "title" | "brief" | "short">, extraDetail: string[] = []) => {
      const fs = jointsFor(ids);
      const n = fs.reduce((a, f) => a + f.points.length, 0);
      op({ partIds: ids, hardware: structural(n), tools: jt, points: fs.flatMap((f) => f.points), detail: [...extraDetail, ...(n ? joinDetail(ids.filter((x) => x !== "side-left" || ids.length === 1), fs) : [])], minutes: 6 + 3 * n, lying: true, ...o });
    };

    op({ group: "preparar", phase: "caja", guidedOnly: true, title: "Reconoce las piezas y los herrajes", brief: "", short: "", minutes: 15,
      detail: ["Extiende todas las piezas sobre una manta o un cartón, para no rayarlas.", "Compáralas con la lista de piezas: mide el largo y el ancho de cada una y pégale un trozo de cinta con su letra.", "El canto con tapacanto es el que queda al frente. En costados, piso y techo, la ranura para el fondo va hacia atrás y hacia adentro.", "Cuenta los herrajes y sepáralos por tipo en tapas o vasos.", "Si las piezas no vienen perforadas, marca y perfora ahora con el plano de perforación que está al final."],
      checks: ["Están todas las piezas de la lista.", "Cada pieza tiene su letra."], tools: ["metro", "cinta de enmascarar", "marcador"] });

    join(["side-left", "bottom"], { group: "caja", phase: "caja", title: `Une el piso al costado izquierdo`, brief: `Acuesta el costado izquierdo con la ranura del fondo hacia arriba. ${joinBrief}`, short: "piso y techo al costado izquierdo",
      checks: ["El piso queda a ras del costado por detrás y por delante.", "La ranura del piso continúa la del costado."], tip: "El canto con tapacanto va siempre hacia el frente." },
      [`Acuesta ${L("side-left")} sobre la manta, con la cara de los agujeros y la ranura hacia arriba.`]);
    join(["top"], { group: "caja", phase: "caja", title: "Une el techo al costado izquierdo", brief: "El techo se une igual, en el otro extremo.", short: "", checks: ["Piso y techo quedan paralelos: mide la separación atrás y adelante."] });
    if (has("plinth")) join(["plinth"], { group: "caja", phase: "caja", title: "Pon el zócalo", brief: "El zócalo va bajo el piso, metido unos centímetros hacia atrás.", short: "zócalo", checks: ["El zócalo queda a ras con el borde inferior del costado."] });
    if (has("divider")) join(["divider"], { group: "fijos", phase: "caja", title: qtyOf("divider") > 1 ? "Coloca las divisiones" : "Coloca la división", brief: "Las divisiones bajan entre el piso y el techo, con el canto enchapado hacia el frente.", short: "divisiones", checks: ["Cada división queda paralela al costado: mide arriba y abajo."] });
    if (has("shelf-fixed")) join(["shelf-fixed"], { group: "fijos", phase: "caja", title: "Coloca el entrepaño fijo", brief: "El entrepaño fijo va sobre el espacio de los cajones.", short: "entrepaño fijo", checks: ["Queda a escuadra con el costado."] });
    if (has("shelf-top")) join(["shelf-top"], { group: "fijos", phase: "caja", title: qtyOf("shelf-top") > 1 ? "Coloca los maleteros" : "Coloca el maletero", brief: "Los maleteros van arriba, sobre la barra de colgar.", short: "maleteros", checks: ["Todos quedan a la misma altura."] });
    op({ group: "fondo", phase: "caja", title: "Desliza el fondo en la ranura", partIds: ["back"], minutes: 5, lying: true,
      brief: "El fondo baja por el lado que aún está abierto, dentro de la ranura del piso, del techo y del costado.", short: "fondo en la ranura",
      detail: [`Toma ${L("back")} con la cara blanca hacia el frente del mueble.`, "Mételo en la ranura del piso y del techo a la vez y bájalo hasta que entre en la ranura del costado.", "Si se traba, no lo golpees: sácalo, limpia la ranura y vuelve a intentar."],
      checks: ["El fondo entró en las tres ranuras y no queda abombado."], tip: "Si no corre, revisa que la ranura esté limpia. No lo fuerces." });
    placed.add("back");
    join(["side-right"], { group: "cierre", phase: "caja", title: "Cierra la caja con el costado derecho", brief: `Encaja el costado derecho sobre el piso, el techo y el fondo. ${j === "minifix" ? "Gira las excéntricas hasta que aprieten." : "Fíjalo igual que el izquierdo."}`, short: "cerrar con el costado derecho",
      checks: ["El fondo entró en la ranura del costado derecho.", "No queda luz en ninguna unión."] });
    op({ group: "cierre", phase: "caja", title: "Para el mueble y escuádralo", hardware: takeId("back-screw"), tools: ["metro", "destornillador de estrella"], minutes: 10,
      brief: "Para el mueble, comprueba la escuadra midiendo las dos diagonales y asegura el fondo.", short: "parar, escuadrar y asegurar el fondo",
      detail: [model.dims.height > 1500 ? "Entre dos personas, levanta el mueble por el techo y páralo. No lo arrastres sobre el zócalo." : "Para el mueble sobre su base.", "Mide las dos diagonales del frente, de esquina a esquina. Si no son iguales, empuja la esquina de la diagonal larga hasta que lo sean.", "Con el mueble a escuadra, fija el fondo por detrás con un tornillo cada 15 cm contra los entrepaños fijos y las divisiones."],
      checks: ["Las dos diagonales miden lo mismo, con 2 mm de tolerancia."], tip: "El fondo es lo que mantiene el mueble a escuadra: no lo dejes suelto." });

    const fx = (kind: Fastening["kind"]) => joints.fastenings.filter((f) => f.kind === kind);
    const heights = (fs: Fastening[]) => [...new Set(fs.flatMap((f) => f.points.map((p) => Math.round(p[1]))))].sort((a, b) => a - b);
    if (has("shelf")) {
      const fs = fx("shelf-pin");
      op({ group: "repisas", phase: "interior", title: "Pon las repisas", partIds: ["shelf"], hardware: take(["shelf-pin"]), points: fs.flatMap((f) => f.points), minutes: 3 * qtyOf("shelf") + 2,
        brief: "Mete cuatro soportes por repisa a la misma altura y apoya cada repisa encima.", short: `${qtyOf("shelf")} repisa(s) sobre soportes`,
        detail: [`Cada repisa lleva 4 soportes: 2 en cada lado, a 50 mm del frente y del fondo de la repisa.`, `Alturas de los soportes, medidas desde el piso del cuarto: ${heights(fs).join(" · ")} mm.`, "Mete los soportes a presión en los agujeros de 5 mm. Si no hay agujero, perfora 10 mm de fondo, con un tope de cinta en la broca para no atravesar.", `Mete cada ${N("shelf")} inclinada y bájala sobre sus cuatro soportes.`],
        checks: ["Cada repisa apoya en sus cuatro soportes y no baila."] });
    }
    if (has("rod")) {
      const fs = fx("rod");
      op({ group: "barra", phase: "interior", title: "Monta la barra de colgar", partIds: ["rod"], hardware: take(["closet-rod", "rod-support"]), tools: ["destornillador de estrella", "nivel"], points: fs.flatMap((f) => f.points), minutes: 10,
        brief: "Atornilla un soporte a cada lado, a la misma altura bajo el maletero, y encaja el tubo.", short: "barra de colgar",
        detail: [`Marca el centro de cada soporte a ${heights(fs).join(" · ")} mm del piso del cuarto y a media profundidad.`, "Atornilla un soporte a cada lado con dos tornillos.", "Corta el tubo 6 mm más corto que el espacio entre parantes y encájalo en los soportes."],
        checks: ["El tubo queda a nivel.", "Un gancho de ropa cabe sin tocar el fondo ni las puertas."] });
    }
    if (has("drawer-side")) {
      const fs = fx("slide");
      const n = params.drawers ?? 1;
      const boxParts = ["drawer-side", "drawer-end", "drawer-bottom"];
      op({ group: "cajones", phase: "interior", title: "Arma las cajas de los cajones", partIds: boxParts, hardware: takeId("drawer-screw", Math.round((model.hardware.find((h) => h.id === "drawer-screw")?.qty ?? 0) * 0.4)), tools: ["destornillador de estrella", "escuadra"], minutes: 12 * n,
        brief: "Arma cada cajón: dos costados, frente interior, trasera y el fondo por debajo.", short: `${n} cajón(es)`,
        detail: [`Cada cajón lleva 2 piezas ${P("drawer-side")}, 2 piezas ${P("drawer-end")} y 1 pieza ${P("drawer-bottom")}.`, "Une los cuatro lados formando un marco, con los costados por fuera. Dos tornillos por esquina.", "Comprueba la escuadra con las diagonales antes de poner el fondo.", "Pon el fondo por debajo y atorníllalo cada 15 cm: es lo que mantiene el cajón a escuadra."],
        checks: ["Las diagonales de cada cajón son iguales.", "El cajón apoya plano sobre la mesa, sin cojear."] });
      op({ group: "cajones", phase: "interior", title: "Atornilla las correderas al mueble", hardware: [...take(["slide"]), ...takeId("drawer-screw", Math.round((model.hardware.find((h) => h.id === "drawer-screw")?.qty ?? 0) * 0.3))], tools: ["destornillador de estrella", "metro"], points: fs.flatMap((f) => f.points), minutes: 8 * n,
        brief: "Separa cada corredera en sus dos partes y atornilla la parte ancha al mueble, a la altura de cada cajón.", short: "correderas al mueble",
        detail: ["Abre cada corredera del todo y suelta la parte delgada apretando la palanca de plástico.", `La parte ancha va en el mueble, con su eje a estas alturas desde el piso del cuarto: ${heights(fs).join(" · ")} mm.`, "El frente de la corredera va a 2 mm del canto del frente del mueble.", "Traza una línea a nivel en cada altura y atornilla sobre ella con 3 tornillos, empezando por los agujeros ovalados, que dejan corregir."],
        checks: ["Las dos correderas de cada cajón están a la misma altura: mide las dos desde el piso."], tip: "Las dos correderas de un cajón deben quedar a la misma altura y a la misma distancia del frente." });
      op({ group: "cajones", phase: "interior", title: "Monta los cajones", partIds: has("drawer-front") ? ["drawer-front"] : [], hardware: [...takeId("drawer-screw"), ...(has("drawer-front") ? takeId("handle", n) : [])], tools: ["destornillador de estrella"], minutes: 8 * n,
        brief: "Atornilla la otra parte de cada corredera al cajón y deslízalo hasta que enganche.", short: has("drawer-front") ? "cajones con sus frentes" : "cajones en sus correderas",
        detail: ["Atornilla la parte delgada de cada corredera al costado del cajón, centrada en su alto y a ras del frente.", "Alinea las dos partes y empuja el cajón hasta el fondo: se oye un clic cuando engancha.", ...(has("drawer-front") ? [`Presenta cada ${N("drawer-front")} con 2 mm de luz a cada lado y atorníllalo desde adentro del cajón.`, "Pon el tirador centrado."] : []), "Abre y cierra cada cajón varias veces."],
        checks: ["Cada cajón corre suave y cierra a tope.", ...(has("drawer-front") ? ["Las luces entre frentes son parejas."] : [])] });
    }
    if (has("door")) {
      const fs = fx("hinge");
      const n = params.doors ?? qtyOf("door");
      op({ group: "puertas", phase: "frentes", title: "Pon las bisagras en las puertas", hardware: take(["hinge"]), tools: ["destornillador de estrella"], minutes: 4 * n,
        brief: "Presiona cada bisagra en su cazoleta y atorníllala.", short: "",
        detail: [`Acuesta cada ${N("door")} con la cara interior hacia arriba.`, "Mete el cuerpo de cada bisagra en su cazoleta de 35 mm, con el brazo perpendicular al canto.", "Atornilla los dos tornillos de cada bisagra.", "Recuerda qué puertas abren a la izquierda y cuáles a la derecha: las bisagras van del lado que abre."],
        checks: ["El brazo de cada bisagra queda a escuadra con el canto de la puerta."] });
      op({ group: "puertas", phase: "frentes", title: "Atornilla las bases al mueble", tools: ["destornillador de estrella", "metro"], points: fs.flatMap((f) => f.points), minutes: 4 * n,
        brief: "Atornilla las bases de las bisagras al costado, a 37 mm del canto del frente.", short: "",
        detail: ["Cada base va a 37 mm del canto del frente del mueble, a la misma altura que su bisagra.", `Alturas desde el piso del cuarto: ${heights(fs).join(" · ")} mm.`, "Atornilla cada base con sus dos tornillos."],
        checks: ["Las bases de una misma puerta están en línea, una sobre otra."] });
      op({ group: "puertas", phase: "frentes", title: "Cuelga las puertas y regúlalas", partIds: ["door"], hardware: takeId("handle"), tools: ["destornillador de estrella"], minutes: 6 * n,
        brief: "Engancha cada puerta en sus bases y regula con los tornillos de la bisagra hasta que las luces queden parejas.", short: `${n} puerta(s) con sus bisagras`,
        detail: ["Sostén la puerta abierta, engancha cada bisagra en su base y presiona hasta oír el clic.", "Cierra la puerta y mira las luces. Cada bisagra tiene tres ajustes:", "El tornillo de adelante mueve la puerta a la izquierda o a la derecha.", "El tornillo de atrás la acerca o la aleja del mueble.", "Los tornillos de la base la suben o la bajan.", "Regula hasta dejar 2 mm parejos entre puertas y con los bordes.", "Pon el tirador de cada puerta."],
        checks: ["Las puertas quedan a ras entre sí y con luces parejas.", "Abren y cierran sin rozar."] });
    }
    const feet = take(["foot"]);
    const tall = model.dims.height > 1200;
    if (feet.length || tall) op({ group: "final", phase: "final", title: tall ? "Nivela y fija al muro" : "Nivela", hardware: feet, tools: tall ? ["nivel", "taladro", "chazos y tornillos según el muro"] : ["nivel"], minutes: 10,
      brief: `${feet.length ? "Regula las patas hasta que el mueble quede a nivel. " : ""}${tall ? "Sujétalo al muro por arriba con dos escuadras: un mueble alto cargado puede volcarse." : ""}`.trim(), short: tall ? "nivelar y fijar al muro" : "nivelar",
      detail: [...(feet.length ? ["Pon el nivel sobre el piso del mueble, a lo ancho y a lo hondo, y gira las patas hasta centrar la burbuja."] : ["Pon el nivel sobre el mueble. Si cojea, calza con cuñas plásticas."]), ...(tall ? ["Marca en el muro dos puntos justo sobre el techo del mueble.", "Perfora, mete chazos y atornilla dos escuadras al muro y al techo del mueble."] : [])],
      checks: [...(tall ? ["Al tirar de arriba hacia ti, el mueble no se mueve."] : ["No cojea."])] });
  }
  // Lo que no quedó asignado a ninguna operación se entrega con la última, para que el inventario cuadre.
  const rest = model.hardware.filter((h) => (left.get(h.id) ?? 0) > 0).map((h) => ({ name: h.name, qty: left.get(h.id)! }));
  if (rest.length && ops.length) ops[ops.length - 1].hardware.push(...rest);
  return ops;
}

export function buildAssemblyPlan(model: FurnitureModel, level: AssemblyLevel = "normal"): AssemblyPlan {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const parts: AssemblyPart[] = [];
  for (const p of model.panels) parts.push({ letter: letters[parts.length % letters.length], id: p.id, name: p.name, qty: p.qty, size: `${p.height} x ${p.width} x ${p.thickness} mm` });
  for (const b of model.bars ?? []) parts.push({ letter: letters[parts.length % letters.length], id: b.id, name: b.name, qty: b.qty, size: `${b.length} mm · ${b.profileId.replace("tubo-", "tubo ")}` });
  for (const f of model.fixtures ?? []) if (!parts.some((x) => x.id === f.kind)) parts.push({ letter: letters[parts.length % letters.length], id: f.kind, name: f.name, qty: (model.fixtures ?? []).filter((x) => x.kind === f.kind).length, size: `${f.box.max[0] - f.box.min[0]} mm` });

  const ops = buildOps(model, parts, model.bars?.length ? { fastenings: [], marks: [] } : computeJoints(model));
  const steps: AssemblyStep[] = [];
  const merge = (group: Op[], title: string, text: string, withDetail: boolean): void => {
    steps.push({
      n: steps.length + 1, title, text,
      actions: withDetail ? group.flatMap((o) => o.detail) : [],
      checks: level === "expert" ? [] : group.flatMap((o) => o.checks).slice(0, level === "guided" ? 4 : 2),
      partIds: group.flatMap((o) => o.partIds), hardware: sumHardware(group.flatMap((o) => o.hardware)), tools: [...new Set(group.flatMap((o) => o.tools))],
      minutes: Math.round(group.reduce((a, o) => a + o.minutes, 0) * (level === "expert" ? 0.7 : 1)),
      ...(level !== "expert" && group.find((o) => o.tip) ? { tip: group.find((o) => o.tip)!.tip } : {}),
      ...(group.some((o) => o.partIds.length) && group.filter((o) => o.partIds.length).every((o) => o.lying) ? { lying: true } : {}),
      points: group.flatMap((o) => o.points),
    });
  };
  if (level === "guided") for (const o of ops) merge([o], o.title, o.brief, true);
  else {
    const key = (o: Op) => (level === "expert" ? o.phase : o.group);
    const real = ops.filter((o) => !o.guidedOnly);
    for (let i = 0; i < real.length;) {
      let k = i + 1;
      while (k < real.length && key(real[k]) === key(real[i])) k++;
      const group = real.slice(i, k);
      if (level === "expert") { const t = group.map((o) => o.short).filter(Boolean).join("; "); merge(group, PHASE_TITLE[group[0].phase], `${t.charAt(0).toUpperCase()}${t.slice(1)}.`, false); }
      else merge(group, group.length > 1 || !GROUP_TITLE[group[0].group] ? GROUP_TITLE[group[0].group] ?? group[0].title : group[0].title, group.map((o) => o.brief).filter(Boolean).join(" "), false);
      i = k;
    }
  }
  const tools = [...new Set(steps.flatMap((s) => s.tools))];
  return { level, parts, hardware: model.hardware, steps, tools, minutes: steps.reduce((a, s) => a + s.minutes, 0) };
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

export interface AssemblyScene {
  /** El paso se muestra con el mueble acostado sobre el costado izquierdo. */
  lying: boolean;
  /** Piezas visibles en su posición final (coordenadas del mueble). Las nuevas traen de dónde llegan. */
  solids: { id: string; box: AABB; fresh: boolean; from?: Vec3 }[];
  /** Dónde van los herrajes del paso. */
  points: Vec3[];
}

/**
 * Qué se ve en un paso: lo ya armado, las piezas que entran y desde dónde llegan. Lo usan el dibujo
 * del manual y el visor 3D. Sin `stepIndex` es el mueble terminado.
 */
export function assemblyScene(model: FurnitureModel, plan: AssemblyPlan, stepIndex?: number): AssemblyScene {
  const stepOf = new Map<string, number>();
  plan.steps.forEach((s, i) => s.partIds.forEach((id) => stepOf.set(id, i)));
  const final = stepIndex === undefined;
  const step = final ? undefined : plan.steps[stepIndex!];
  const current = new Set(step?.partIds ?? []);
  const lying = !!step?.lying;
  // La primera pieza de todo el armado es la base: no llega de ningún lado.
  const base = plan.steps.find((s) => s.partIds.length)?.partIds[0];
  const out: AssemblyScene["solids"] = [];
  for (const s of solids(model)) {
    const at = stepOf.get(s.id);
    if (!final && (at === undefined || at > stepIndex!)) continue;
    const fresh = current.has(s.id);
    const natural = fresh && s.id !== base ? ARRIVES_FROM[s.id] : undefined;
    // Acostado, todo baja desde arriba: es el único lado abierto de la caja.
    const from: Vec3 | undefined = natural && lying ? [Math.max(...natural), 0, 0] : natural;
    out.push({ id: s.id, box: s.box, fresh, ...(from ? { from } : {}) });
  }
  return { lying, solids: out, points: step?.points ?? [] };
}

/**
 * Dibujo de un paso: lo ya armado en gris, las piezas del paso en negro y separadas de su lugar,
 * con una flecha y su letra. Con `stepIndex` omitido dibuja el mueble terminado.
 */
export function assemblySvg(model: FurnitureModel, plan: AssemblyPlan, stepIndex?: number): string {
  const final = stepIndex === undefined;
  const view = assemblyScene(model, plan, stepIndex);
  const lying = view.lying;
  const tall = model.dims.height;
  /** Acostado sobre el costado izquierdo: lo que era ancho pasa a ser altura. */
  const lay = (b: AABB): AABB => ({ min: [tall - b.max[1], b.min[0], b.min[2]], max: [tall - b.min[1], b.max[0], b.max[2]] });
  const layPoint = (q: Vec3): Vec3 => (lying ? [tall - q[1], q[0], q[2]] : q);
  const scene: (Solid & { fresh: boolean; from?: Vec3 })[] = view.solids.map((s) => {
    const d = s.from;
    const moved: AABB = d ? { min: [s.box.min[0] + d[0], s.box.min[1] + d[1], s.box.min[2] + d[2]], max: [s.box.max[0] + d[0], s.box.max[1] + d[1], s.box.max[2] + d[2]] } : s.box;
    return { id: s.id, fresh: s.fresh, from: d && lying ? [-d[1], d[0], d[2]] : d, box: lying ? lay(moved) : moved };
  });
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
      labels.push(`<circle class="lt" cx="${lx}" cy="${ly}" r="13" fill="#fff" stroke="#111" stroke-width="2"/><text x="${lx}" y="${ly + 5}" font-size="15" font-weight="700" text-anchor="middle">${letterOf.get(s.id) ?? "?"}</text>`);
    }
  }
  // Dónde van los herrajes del paso: un punto con aro, visible aunque quede detrás de una pieza.
  const dots = view.points.map((q) => { const [x, y] = P(layPoint(q)).split(","); return `<circle class="pt" cx="${x}" cy="${y}" r="5.5" fill="#fff" stroke="#111" stroke-width="1.8"/><circle cx="${x}" cy="${y}" r="1.8" fill="#111"/>`; }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif" fill="#111"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#111"/></marker></defs><rect width="100%" height="100%" fill="#fff"/>${body.join("")}${dots}${labels.join("")}</svg>`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Manual de armado imprimible, al nivel de detalle pedido: portada, inventario, pasos y plano de perforación por pieza. */
export function assemblyHtml(model: FurnitureModel, title: string, level: AssemblyLevel = "normal"): string {
  const plan = buildAssemblyPlan(model, level);
  const hours = plan.minutes >= 60 ? `${Math.floor(plan.minutes / 60)} h ${plan.minutes % 60 ? `${plan.minutes % 60} min` : ""}`.trim() : `${plan.minutes} min`;
  const levelName = ASSEMBLY_LEVELS.find((l) => l.id === level)!.name.toLowerCase();
  const steps = plan.steps.map((s, i) => `<section class="step"><div class="n">${s.n}</div><div class="c"><h2>${esc(s.title)}</h2>${s.partIds.length || s.points.length ? assemblySvg(model, plan, i) : ""}${s.text ? `<p>${esc(s.text)}</p>` : ""}
${s.actions.length ? `<ol class="acts">${s.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>` : ""}${s.checks.length ? `<ul class="checks">${s.checks.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}${s.tip ? `<p class="tip">${esc(s.tip)}</p>` : ""}
<div class="chips">${s.partIds.map((id) => plan.parts.find((p) => p.id === id)).filter(Boolean).map((p) => `<span class="chip"><b>${p!.letter}</b> ${esc(p!.name)} × ${p!.qty}</span>`).join("")}${s.hardware.map((h) => `<span class="chip hw">${esc(h.name)} × ${h.qty}</span>`).join("")}</div>
${s.tools.length ? `<p class="tools">Herramientas: ${esc(s.tools.join(", "))}.</p>` : ""}</div></section>`).join("\n");
  const sheets = model.bars?.length ? [] : drillSheets(model);
  const drilling = sheets.length ? `<h2 class="break">Plano de perforación</h2>
<p>Dónde va cada perforación, pieza por pieza. Llévalo a la tienda junto con el despiece si quieres que te entreguen las piezas ya perforadas, o úsalo para marcar en casa. El círculo pequeño de la esquina es el origen de las medidas. Los triángulos son perforaciones en el canto.</p>
${sheets.map((d) => `<section class="drill"><h3>${esc(d.name)}${d.copies > 1 ? ` × ${d.copies} iguales` : ""} <span class="muted">${plan.parts.find((p) => p.id === d.partId)?.letter ?? ""}</span></h3>${drillSheetSvg(d)}<ul>${d.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></section>`).join("\n")}` : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Armado · ${esc(title)}</title><style>
body{font:14px/1.45 Helvetica,Arial,sans-serif;color:#111;margin:28px auto;max-width:860px;padding:0 20px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:0 0 8px}h3{font-size:14px;margin:0 0 4px}
.muted{color:#56606a;font-weight:400}table{border-collapse:collapse;width:100%;margin:6px 0 18px}th,td{border:1px solid #c9ced3;padding:5px 8px;text-align:left;font-size:13px}th{background:#f1f2f4}td.l{font-weight:700;text-align:center;width:36px}td.n{font-family:monospace}
svg{max-width:100%;height:auto;display:block;margin:4px 0 8px}.step{display:flex;gap:16px;border-top:2px solid #111;padding:18px 0;break-inside:avoid}.step .n{flex:0 0 56px;height:56px;border:3px solid #111;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700}
.step .c{flex:1;min-width:0}.tip{border-left:4px solid #111;padding:4px 10px;background:#f6f6f4}.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.chip{border:1.5px solid #111;border-radius:99px;padding:2px 10px;font-size:12.5px}.chip.hw{border-style:dashed}.tools{color:#56606a;font-size:13px}
.acts{margin:6px 0;padding-left:22px}.acts li{margin:3px 0}.checks{list-style:none;margin:8px 0;padding:0}.checks li{padding-left:24px;position:relative;margin:2px 0}.checks li::before{content:"";position:absolute;left:2px;top:3px;width:12px;height:12px;border:1.5px solid #111}
.break{border-top:2px solid #111;padding-top:18px;margin-top:8px}.drill{break-inside:avoid;border-top:1px solid #c9ced3;padding:12px 0}.drill ul{margin:4px 0;padding-left:20px;font-size:13px}
@media print{body{margin:0}.step,.drill{break-inside:avoid}}
</style></head><body>
<h1>${esc(title)}</h1>
<p class="muted">${model.dims.width} x ${model.dims.height} x ${model.dims.depth} mm · ${plan.steps.length} pasos · unas ${hours} · manual ${levelName} · ${model.bars?.length ? "estructura de tubo" : model.joinery === "minifix" || model.joinery === "dowel" ? "sin tornillos a la vista" : `unión ${model.joinery}`}</p>
${assemblySvg(model, plan)}
<h2>Antes de empezar</h2>
<p>Revisa que estén todas las piezas y herrajes. Trabaja sobre una superficie plana y limpia, con una manta o cartón para no rayar. Herramientas: ${esc(plan.tools.join(", ") || "ninguna especial")}.</p>
<h2>Piezas</h2>
<table><thead><tr><th></th><th>Pieza</th><th>Cant.</th><th>Medida</th></tr></thead><tbody>${plan.parts.map((p) => `<tr><td class="l">${p.letter}</td><td>${esc(p.name)}</td><td class="n">${p.qty}</td><td class="n">${esc(p.size)}</td></tr>`).join("")}</tbody></table>
<h2>Herrajes</h2>
<table><thead><tr><th>Herraje</th><th>Cant.</th></tr></thead><tbody>${plan.hardware.map((h) => `<tr><td>${esc(h.name)}</td><td class="n">${h.qty}</td></tr>`).join("")}</tbody></table>
${steps}
${drilling}
</body></html>
`;
}
