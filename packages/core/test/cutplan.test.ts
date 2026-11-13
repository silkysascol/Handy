import { describe, expect, it } from "vitest";
import { addRoom, buildCutPlan, buildCutlist, createWorld, cutlistCsv, cutPlanSvg, generateCabinet, mergedModel, placeCabinet, type CutPlan } from "../src/index.js";

function assertValid(plan: CutPlan) {
  for (const s of plan.sheets) {
    for (const p of s.pieces) {
      expect(p.x).toBeGreaterThanOrEqual(plan.trim);
      expect(p.y).toBeGreaterThanOrEqual(plan.trim);
      expect(p.x + p.w).toBeLessThanOrEqual(s.width - plan.trim);
      expect(p.y + p.h).toBeLessThanOrEqual(s.height - plan.trim);
    }
    for (let a = 0; a < s.pieces.length; a++) for (let b = a + 1; b < s.pieces.length; b++) {
      const A = s.pieces[a], B = s.pieces[b];
      // Entre dos piezas debe caber el disco de la sierra.
      const apart = A.x + A.w + plan.kerf <= B.x || B.x + B.w + plan.kerf <= A.x || A.y + A.h + plan.kerf <= B.y || B.y + B.h + plan.kerf <= A.y;
      expect(apart, `${A.name} y ${B.name} se pisan o no dejan el disco`).toBe(true);
    }
  }
}

describe("plano de corte", () => {
  it("acomoda todas las piezas de un armario sin pisarse y dentro del tablero", () => {
    const m = generateCabinet({ width: 800, height: 2000, depth: 500, shelves: 3, doors: 2, plinthHeight: 80 });
    const plan = buildCutPlan(m);
    assertValid(plan);
    const placed = plan.sheets.flatMap((s) => s.pieces).length;
    expect(placed).toBe(m.panels.reduce((n, p) => n + p.qty, 0));
    expect(plan.oversize).toEqual([]);
    expect(plan.totals.find((t) => t.materialId === "melamine-18-white")!.sheets).toBe(2);
    expect(plan.totals.find((t) => t.materialId === "hdf-3-white")!.sheets).toBe(1);
  });

  it("no gira piezas cuando el decorado tiene veta", () => {
    const m = generateCabinet({ width: 800, height: 2000, depth: 500, doors: 2 });
    m.materials[0] = { ...m.materials[0], finish: "Roble Americano", name: "Melamina 18 mm Roble" };
    const plan = buildCutPlan(m);
    assertValid(plan);
    expect(plan.sheets.filter((s) => s.materialId === "melamine-18-white").flatMap((s) => s.pieces).every((p) => !p.rotated)).toBe(true);
  });

  it("reporta piezas que no caben en el formato", () => {
    const m = generateCabinet({ width: 800, height: 2600, depth: 500 });
    const plan = buildCutPlan(m);
    expect(plan.oversize.map((o) => o.name)).toEqual(expect.arrayContaining(["Costado izquierdo", "Costado derecho"]));
    // La lista de corte cae al cálculo por área para no prometer un número falso.
    expect(buildCutlist(m).materials[0].sheetsEstimate).toBeGreaterThanOrEqual(1);
  });

  it("un mundo con varios muebles comparte tableros", () => {
    const w = createWorld("Casa");
    addRoom(w, { name: "Sala", width: 5000, depth: 4000 });
    for (let i = 0; i < 4; i++) placeCabinet(w, { roomId: "sala", wall: "north", offset: i * 700, name: `Estante ${i + 1}`, params: { width: 600, height: 900, depth: 300, shelves: 2 } });
    const merged = mergedModel(w);
    const plan = buildCutPlan(merged);
    assertValid(plan);
    const separate = w.items.length; // un tablero por mueble si se compraran por separado
    expect(plan.totals.find((t) => t.materialId === "melamine-18-white")!.sheets).toBeLessThan(separate);
    expect(buildCutlist(merged).materials.find((x) => x.materialId === "melamine-18-white")!.sheetsEstimate).toBe(plan.totals.find((t) => t.materialId === "melamine-18-white")!.sheets);
  });

  it("genera SVG y CSV utilizables", () => {
    const m = generateCabinet({ width: 800, height: 2000, depth: 500, shelves: 3, doors: 2 });
    const svg = cutPlanSvg(buildCutPlan(m));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Tablero 1 de 2");
    expect(svg).toContain("Costado izquierdo");
    const csv = cutlistCsv(m).trim().split("\n");
    expect(csv[0]).toBe("Pieza;Cantidad;Largo (mm);Ancho (mm);Espesor (mm);Material;Veta;Canto largo 1;Canto largo 2;Canto corto 1;Canto corto 2;Notas");
    expect(csv.find((r) => r.startsWith("Puerta"))).toContain(";2;1996;397;18;");
    expect(csv.length).toBe(m.panels.length + 1);
  });
});

describe("el mejor acomodo entre varios", () => {
  it("prueba varios acomodos, nunca usa más tableros que el área mínima permite menos uno, y marca el retal", () => {
    const m = generateCabinet({ width: 1800, height: 2200, depth: 600, dividers: 2, hangingBar: true, shelves: 3, drawers: 3, doors: 6, plinthHeight: 80 });
    const plan = buildCutPlan(m);
    expect(plan.layoutsTried).toBe(8);
    for (const t of plan.totals) {
      const sheets = plan.sheets.filter((s) => s.materialId === t.materialId);
      const area = sheets.reduce((a, s) => a + s.pieces.reduce((b, p) => b + p.w * p.h, 0), 0);
      const minimum = Math.ceil(area / ((sheets[0].width - 20) * (sheets[0].height - 20)));
      // Con cortes de lado a lado no siempre se llega al mínimo teórico, pero no se aleja más de un tablero.
      expect(t.sheets).toBeLessThanOrEqual(minimum + 1);
    }
    for (const s of plan.sheets) {
      if (!s.offcut) continue;
      const o = s.offcut;
      expect(o.x + o.w).toBeLessThanOrEqual(s.width - 10);
      expect(o.y + o.h).toBeLessThanOrEqual(s.height - 10);
      // El retal no pisa ninguna pieza.
      for (const p of s.pieces) expect(p.x + p.w <= o.x || o.x + o.w <= p.x || p.y + p.h <= o.y || o.y + o.h <= p.y, `${p.name} pisa el retal`).toBe(true);
    }
    expect(plan.sheets.some((s) => s.offcut)).toBe(true);
    expect(cutPlanSvg(plan)).toMatch(/Retal \d+ x \d+/);
  });

  it("las piezas siguen sin pisarse y dentro del tablero en cualquier acomodo elegido", () => {
    for (const params of [{ width: 2400, height: 2300, depth: 550, dividers: 3, shelves: 4, doors: 8 }, { width: 600, height: 700, depth: 500, doors: 1, shelves: 1 }, { width: 1200, height: 900, depth: 450, drawers: 4, doors: 0, dividers: 1 }]) {
      const plan = buildCutPlan(generateCabinet(params));
      for (const s of plan.sheets) {
        for (const p of s.pieces) { expect(p.x).toBeGreaterThanOrEqual(10); expect(p.y).toBeGreaterThanOrEqual(10); expect(p.x + p.w).toBeLessThanOrEqual(s.width - 10); expect(p.y + p.h).toBeLessThanOrEqual(s.height - 10); }
        for (let a = 0; a < s.pieces.length; a++) for (let b = a + 1; b < s.pieces.length; b++) {
          const p = s.pieces[a], q = s.pieces[b];
          expect(p.x + p.w + 3 <= q.x || q.x + q.w + 3 <= p.x || p.y + p.h + 3 <= q.y || q.y + q.h + 3 <= p.y, `${p.name} y ${q.name} se pisan`).toBe(true);
        }
      }
    }
  });
});
