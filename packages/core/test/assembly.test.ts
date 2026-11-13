import { describe, expect, it } from "vitest";
import { assemblyHtml, assemblyScene, assemblySvg, buildAssemblyPlan, computeJoints, drillSheets, drillSheetSvg, generateCabinet, generateFrame, type AssemblyLevel, type FurnitureModel } from "../src/index.js";

/** Cada pieza entra en un solo paso y los herrajes repartidos suman lo que trae el mueble. */
function assertComplete(m: FurnitureModel, level: AssemblyLevel = "normal") {
  const plan = buildAssemblyPlan(m, level);
  const used = plan.steps.flatMap((s) => s.partIds);
  expect(new Set(used).size, "una pieza aparece en dos pasos").toBe(used.length);
  for (const p of plan.parts) expect(used, `${p.name} no entra en ningún paso`).toContain(p.id);
  for (const id of used) expect(plan.parts.some((p) => p.id === id), `el paso pide ${id}, que no existe`).toBe(true);
  const sum = new Map<string, number>();
  for (const s of plan.steps) for (const h of s.hardware) sum.set(h.name, (sum.get(h.name) ?? 0) + h.qty);
  const total = new Map<string, number>();
  for (const h of m.hardware) total.set(h.name, (total.get(h.name) ?? 0) + h.qty);
  expect(Object.fromEntries(sum)).toEqual(Object.fromEntries(total));
  expect(new Set(plan.parts.map((p) => p.letter)).size).toBe(plan.parts.length);
  plan.steps.forEach((s, i) => expect(s.n).toBe(i + 1));
  expect(plan.minutes).toBe(plan.steps.reduce((a, s) => a + s.minutes, 0));
  return plan;
}

describe("instrucciones de armado", () => {
  it("gabinete sencillo: caja, fondo, cierre, repisas y puertas, en ese orden", () => {
    const m = generateCabinet({ width: 800, height: 720, depth: 560, shelves: 1, doors: 2, joinery: "minifix" });
    const plan = assertComplete(m);
    expect(plan.steps.map((s) => s.partIds[0])).toEqual(["side-left", "back", "side-right", "shelf", "door"]);
    expect(plan.steps[0].text).toMatch(/excéntrica/);
    expect(plan.tools).toContain("destornillador de estrella");
    // El fondo entra antes de cerrar la caja: después ya no cabe en la ranura.
    const at = (id: string) => plan.steps.findIndex((s) => s.partIds.includes(id));
    expect(at("back")).toBeLessThan(at("side-right"));
  });

  it("closet completo: divisiones antes del fondo, y barra, cajones y puertas al final", () => {
    const m = generateCabinet({ width: 1800, height: 2200, depth: 600, dividers: 2, hangingBar: true, shelves: 3, drawers: 3, doors: 6, plinthHeight: 80, joinery: "minifix" });
    const plan = assertComplete(m);
    const at = (id: string) => plan.steps.findIndex((s) => s.partIds.includes(id));
    expect(at("divider")).toBeLessThan(at("back"));
    expect(at("back")).toBeLessThan(at("side-right"));
    expect(at("side-right")).toBeLessThan(at("rod"));
    expect(at("rod")).toBeLessThan(at("drawer-side"));
    expect(at("drawer-side")).toBeLessThan(at("door"));
    expect(plan.steps[plan.steps.length - 1].title).toMatch(/fija al muro/i);
    expect(plan.steps[0].partIds).toContain("plinth");
  });

  it("cada tipo de unión trae sus herramientas y sus herrajes cuadran", () => {
    for (const joinery of ["confirmat", "minifix", "dowel", "pocket-screw"] as const) {
      const plan = assertComplete(generateCabinet({ width: 900, height: 1800, depth: 400, shelves: 4, doors: 2, dividers: 1, joinery }));
      expect(plan.tools.length, joinery).toBeGreaterThan(0);
    }
    expect(buildAssemblyPlan(generateCabinet({ width: 600, height: 700, depth: 500, joinery: "confirmat" })).tools).toContain("llave Allen de 4 mm");
    assertComplete(generateCabinet({ width: 600, height: 700, depth: 500, doors: 0, drawers: 3 }));
  });

  it("estructura de tubo: marcos laterales, travesaños, pintura y cubierta", () => {
    const m = generateFrame({ type: "table", width: 1500, height: 900, depth: 700, top: true });
    const plan = assertComplete(m);
    expect(plan.steps.map((s) => s.title)).toEqual(["Arma los dos marcos laterales", "Une los marcos con los travesaños largos", "Limpia y pinta", "Fija la cubierta"]);
    expect(plan.tools).toContain("soldadora");
    const bolted = assertComplete(generateFrame({ type: "shelving", width: 900, height: 2000, depth: 400, levels: 4, joint: "bolt" }));
    expect(bolted.tools).not.toContain("soldadora");
    expect(bolted.steps.some((s) => /muro/.test(s.title))).toBe(true);
  });

  it("dibuja cada paso: tres caras por caja, piezas nuevas con letra y flecha", () => {
    const m = generateCabinet({ width: 800, height: 720, depth: 560, shelves: 1, doors: 2 });
    const plan = buildAssemblyPlan(m);
    const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length;
    const first = assemblySvg(m, plan, 0);
    expect(first).toMatch(/^<svg /);
    expect(count(first, /<polygon/g)).toBe(3 * 3); // costado, piso y techo
    expect(count(first, /<circle class="lt"/g)).toBe(3);
    expect(count(first, /<circle class="pt"/g)).toBe(6); // tres herrajes por unión, dos uniones
    expect(count(first, /marker-end/g)).toBe(2); // el costado es la base y no se mueve
    const doors = assemblySvg(m, plan, plan.steps.length - 1);
    expect(count(doors, /<circle class="lt"/g)).toBe(1);
    const done = assemblySvg(m, plan);
    expect(count(done, /<polygon/g)).toBe(3 * (4 + 1 + 1 + 2)); // caja, fondo, repisa y dos puertas
    expect(count(done, /<circle/g)).toBe(0);
    expect(done).not.toMatch(/NaN/);
  });

  it("el manual imprimible trae inventario, herrajes y un bloque por paso", () => {
    const m = generateCabinet({ width: 1800, height: 2200, depth: 600, dividers: 2, hangingBar: true, shelves: 3, drawers: 3, doors: 6, joinery: "minifix" });
    const html = assemblyHtml(m, "Closet <principal>");
    const plan = buildAssemblyPlan(m);
    expect(html).toContain("Closet &lt;principal&gt;");
    expect(html).toContain("<h2>Piezas</h2>");
    expect(html).toContain("<h2>Herrajes</h2>");
    expect((html.match(/<section class="step">/g) ?? []).length).toBe(plan.steps.length);
    expect(html).toContain("sin tornillos a la vista");
    expect(html).not.toMatch(/NaN|undefined/);
  });

  it("tres niveles: el guiado va pieza por pieza con cada acción y medida; el experto resume", () => {
    const closet = generateCabinet({ width: 1800, height: 2200, depth: 600, dividers: 2, hangingBar: true, shelves: 3, drawers: 3, doors: 6, plinthHeight: 80, joinery: "minifix" });
    const guided = assertComplete(closet, "guided");
    const normal = assertComplete(closet, "normal");
    const expert = assertComplete(closet, "expert");
    expect(guided.steps.length).toBeGreaterThan(normal.steps.length);
    expect(normal.steps.length).toBeGreaterThan(expert.steps.length);
    expect(expert.steps.map((s) => s.title)).toEqual(["Arma la caja", "Monta el interior", "Pon los frentes", "Nivela y fija"]);
    expect(expert.steps.every((s) => !s.actions.length && !s.checks.length)).toBe(true);
    expect(expert.minutes).toBeLessThan(normal.minutes);

    // Guiado: empieza reconociendo piezas, y cada unión dice cuántos herrajes y dónde, con medidas.
    expect(guided.steps[0].title).toBe("Reconoce las piezas y los herrajes");
    const floor = guided.steps.find((s) => s.title === "Une el piso al costado izquierdo")!;
    expect(floor.partIds).toEqual(["side-left", "bottom"]);
    expect(floor.actions.join(" ")).toMatch(/Enrosca los pernos minifix .* Van 3 en el costado izquierdo \(A\), en la cara derecha, sobre la línea a 89 mm desde abajo, a 50 · 300 · 550 mm desde el canto trasero/);
    expect(floor.actions.join(" ")).toMatch(/excéntrica .* flecha/);
    expect(floor.hardware).toEqual([{ name: "Excéntrica minifix 15 mm", qty: 3 }, { name: "Perno minifix (espiga roscada)", qty: 3 }, { name: "Tarugo madera 8 x 30 mm", qty: 3 }]);
    expect(floor.points).toHaveLength(3);
    expect(floor.checks.length).toBeGreaterThan(0);
    const bases = guided.steps.find((s) => s.title === "Atornilla las bases al mueble")!;
    expect(bases.actions.join(" ")).toMatch(/37 mm del canto del frente/);
    expect(bases.points).toHaveLength(30);
    expect(guided.steps.find((s) => /regúlalas/.test(s.title))!.actions.join(" ")).toMatch(/izquierda o a la derecha/);
    expect(guided.steps.every((s) => s.actions.length >= 2)).toBe(true);
    // Cada nivel reparte los mismos herrajes y las mismas piezas.
    for (const joinery of ["confirmat", "dowel", "pocket-screw"] as const) for (const level of ["guided", "normal", "expert"] as const) assertComplete(generateCabinet({ width: 900, height: 1800, depth: 400, shelves: 2, doors: 2, dividers: 1, drawers: 2, joinery }), level);
    for (const level of ["guided", "expert"] as const) assertComplete(generateFrame({ type: "shelving", width: 900, height: 2000, depth: 400, levels: 4, top: true }), level);
    expect(buildAssemblyPlan(generateFrame({ type: "table", width: 1500, height: 900, depth: 700 }), "guided").steps[0].title).toBe("Revisa los cortes");
  });

  it("la escena de un paso dice qué entra, desde dónde y dónde van los herrajes", () => {
    const m = generateCabinet({ width: 800, height: 720, depth: 560, shelves: 1, doors: 2, joinery: "minifix" });
    const plan = buildAssemblyPlan(m, "guided");
    const i = plan.steps.findIndex((s) => s.partIds.includes("bottom"));
    const scene = assemblyScene(m, plan, i);
    expect(scene.lying).toBe(true);
    expect(scene.solids.map((s) => [s.id, s.fresh, !!s.from])).toEqual([["side-left", true, false], ["bottom", true, true]]);
    expect(scene.points).toHaveLength(3);
    const done = assemblyScene(m, plan);
    expect(done.solids.every((s) => !s.fresh)).toBe(true);
    expect(done.solids).toHaveLength(8);
  });
});

describe("uniones y plano de perforación", () => {
  const m = () => generateCabinet({ width: 800, height: 720, depth: 560, shelves: 1, doors: 2, joinery: "minifix" });

  it("los herrajes de la lista salen de las uniones reales", () => {
    const model = m();
    const j = computeJoints(model);
    const structural = j.fastenings.filter((f) => f.kind === "structural");
    expect(structural).toHaveLength(4); // piso y techo contra cada costado
    const n = structural.reduce((a, f) => a + f.points.length, 0);
    expect(n).toBe(12);
    expect(model.hardware.find((h) => h.id === "minifix-cam-15")!.qty).toBe(n);
    expect(j.fastenings.filter((f) => f.kind === "hinge").reduce((a, f) => a + f.points.length, 0)).toBe(model.hardware.find((h) => h.id === "hinge-35")!.qty);
    expect(j.fastenings.filter((f) => f.kind === "shelf-pin").reduce((a, f) => a + f.points.length, 0)).toBe(model.hardware.find((h) => h.id === "shelf-pin-5")!.qty);
    // Un zócalo corto lleva un solo herraje por punta, no tres.
    const withPlinth = generateCabinet({ width: 800, height: 720, depth: 560, plinthHeight: 80, joinery: "confirmat" });
    expect(withPlinth.hardware.find((h) => h.id === "confirmat-7x50")!.qty).toBe(12 + 2);
  });

  it("cada perforación cae dentro de su pieza y tiene medida, diámetro y cara", () => {
    for (const joinery of ["minifix", "confirmat", "dowel", "pocket-screw"] as const) {
      const model = generateCabinet({ width: 1800, height: 2200, depth: 600, dividers: 2, hangingBar: true, shelves: 3, drawers: 3, doors: 6, plinthHeight: 80, joinery });
      const sheets = drillSheets(model);
      expect(sheets.length, joinery).toBeGreaterThan(3);
      for (const sh of sheets) {
        for (const mk of sh.marks) {
          expect(mk.u, `${sh.name} ${mk.what}`).toBeGreaterThanOrEqual(0);
          expect(mk.u, `${sh.name} ${mk.what}`).toBeLessThanOrEqual(sh.width);
          expect(mk.v, `${sh.name} ${mk.what}`).toBeGreaterThanOrEqual(0);
          expect(mk.v, `${sh.name} ${mk.what}`).toBeLessThanOrEqual(sh.height);
          expect(mk.edge ? mk.face : "x").toBe(mk.edge ? undefined : mk.edge ? "" : "x");
          if (!mk.edge) expect(mk.face).toMatch(/^cara /);
        }
        expect(sh.lines.length).toBeGreaterThan(0);
        expect(drillSheetSvg(sh)).toMatch(/^<svg /);
      }
    }
  });

  it("el plano dice lo mismo en texto, y las piezas iguales se juntan", () => {
    const sheets = drillSheets(m());
    const side = sheets.find((s) => s.partId === "side-left")!;
    expect([side.width, side.height]).toEqual([560, 720]);
    expect(side.lines).toContain("Perno minifix (Ø5 mm, 12 mm de fondo), en la cara derecha: línea a 9 mm desde abajo; taladros a 50 · 280 · 510 mm desde el canto trasero.");
    expect(side.lines.some((l) => /^Base de bisagra .* línea a 523 mm desde el canto trasero; taladros a 102 · 618 mm desde abajo\.$/.test(l))).toBe(true);
    expect(side.lines.some((l) => /^Soporte de repisa/.test(l))).toBe(true);
    const top = sheets.find((s) => s.partId === "top")!;
    expect(top.lines.some((l) => /^Excéntrica \(Ø15 mm, 13 mm de fondo\), en la cara de abajo: línea a 34 mm desde el canto izquierdo/.test(l))).toBe(true);
    expect(top.lines.some((l) => /^Paso del perno .* en el canto/.test(l))).toBe(true);
    // Las dos puertas llevan las cazoletas en lados opuestos: son planos distintos. Dos repisas iguales no llevan ninguno.
    expect(sheets.filter((s) => s.partId === "door")).toHaveLength(2);
    const html = assemblyHtml(m(), "Bajo", "guided");
    expect(html).toContain("Plano de perforación");
    expect(html).toContain("manual guiado");
    expect((html.match(/<section class="drill">/g) ?? []).length).toBe(sheets.length);
    expect(html).toContain('<ol class="acts">');
    expect(html).toContain('<ul class="checks">');
    expect(assemblyHtml(m(), "Bajo", "expert")).not.toContain('<ol class="acts">');
  });
});
