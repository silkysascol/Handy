import { describe, expect, it } from "vitest";
import { assemblyHtml, assemblySvg, buildAssemblyPlan, generateCabinet, generateFrame, type FurnitureModel } from "../src/index.js";

/** Cada pieza entra en un solo paso y los herrajes repartidos suman lo que trae el mueble. */
function assertComplete(m: FurnitureModel) {
  const plan = buildAssemblyPlan(m);
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
    expect(count(first, /<circle/g)).toBe(3);
    expect(count(first, /marker-end/g)).toBe(2); // el costado es la base y no se mueve
    const doors = assemblySvg(m, plan, plan.steps.length - 1);
    expect(count(doors, /<circle/g)).toBe(1);
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
});
