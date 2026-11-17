import { describe, expect, it } from "vitest";
import {
  addRoom, buildAssemblyPlan, buildCutlist, buildCutPlan, cornerTemplateSvg, createWorld, cutSheetHtml, exportGltf, generateCabinet, generateFrame, itemBox, itemModel, overlaps, panelBox,
  roundedPieces, runCommand, type Selection, type World,
} from "../src/index.js";

function setup() {
  const w = createWorld("Casa");
  const room = addRoom(w, { name: "Cocina", width: 5000, depth: 4000, height: 2400 });
  return { w, room, sel: { kind: "room", roomId: room.id } as Selection, wall: { kind: "wall", roomId: room.id, wall: "north" } as Selection };
}
const say = (w: World, sel: Selection, text: string) => runCommand(w, sel, text);

describe("cubierta y esquinas redondeadas", () => {
  it("la cubierta cuenta dentro de la altura total, vuela al frente y no se cruza con el mueble", () => {
    const plain = generateCabinet({ width: 1200, height: 900, depth: 600, doors: 2, shelves: 1 });
    const m = generateCabinet({ width: 1200, height: 900, depth: 600, doors: 2, shelves: 1, countertop: {} });
    expect(m.dims).toEqual({ width: 1200, height: 900, depth: 600 });
    const top = m.panels.find((p) => p.id === "countertop")!;
    expect([top.height, top.width, top.thickness]).toEqual([1200, 600 + 18 + 20, 18]);
    const box = panelBox(top)!;
    expect(box).toEqual({ min: [0, 882, 0], max: [1200, 900, 638] });
    // El cuerpo baja 18 mm: los costados ya no miden 900.
    expect(m.panels.find((p) => p.id === "side-left")!.height).toBe(882);
    expect(plain.panels.find((p) => p.id === "side-left")!.height).toBe(900);
    for (const p of m.panels.filter((x) => x.id !== "countertop" && x.id !== "back")) expect(overlaps(panelBox(p)!, box, 1), p.name).toBe(false);
    expect(m.hardware.find((h) => h.id === "countertop-screw")!.qty).toBe(8);
    expect(top.cornerRadius).toBeUndefined();
    expect(roundedPieces(m)).toEqual([]);
  });

  it("contra un muro se redondean las dos esquinas del frente; suelto, las cuatro", () => {
    const front = generateCabinet({ width: 1200, height: 900, depth: 600, countertop: { cornerRadius: 60 } }).panels.find((p) => p.id === "countertop")!;
    expect([front.cornerRadius, front.roundedCorners, front.edgeBanding.left]).toEqual([60, "front", false]);
    expect(front.notes).toMatch(/Redondear las 2 esquinas del frente a R60/);
    const all = generateCabinet({ width: 1200, height: 900, depth: 600, countertop: { cornerRadius: 60, roundAll: true } }).panels.find((p) => p.id === "countertop")!;
    expect([all.roundedCorners, all.edgeBanding.left]).toEqual(["all", true]);
    // El tapacanto de una pieza redondeada es más corto: cada esquina cambia 2R rectos por un cuarto de círculo.
    const meters = (radius?: number) => buildCutlist(generateFrame({ type: "table", width: 1200, height: 750, depth: 600, cornerRadius: radius })).rows.find((r) => r.name === "Cubierta")!.edgeBandMeters;
    expect(meters()).toBe(3.6);
    expect(meters(100)).toBeCloseTo(3.6 - (4 * 100 * (2 - Math.PI / 2)) / 1000, 2);
    // Límites del radio.
    expect(() => generateCabinet({ width: 1200, height: 900, depth: 600, countertop: { cornerRadius: 5 } })).toThrow(/al menos 10 mm/);
    expect(() => generateFrame({ type: "table", width: 1200, height: 750, depth: 600, cornerRadius: 400 })).toThrow(/el máximo es 300 mm/);
    // Los entrepaños de una estantería no se redondean.
    expect(roundedPieces(generateFrame({ type: "shelving", width: 1000, height: 1800, depth: 400, cornerRadius: 50 }))).toEqual([]);
  });

  it("el despiece la pide rectangular y trae la plantilla del radio a tamaño real", () => {
    const m = generateCabinet({ width: 1800, height: 900, depth: 600, drawers: 4, countertop: { cornerRadius: 80, roundAll: true } });
    // El plano de corte la trata como un rectángulo más.
    expect(buildCutPlan(m).sheets.flatMap((s) => s.pieces).some((p) => p.panelId === "countertop")).toBe(true);
    const html = cutSheetHtml(m, "Isla");
    expect(html).toContain("<h2>Esquinas redondeadas</h2>");
    expect(html).toMatch(/<strong>Cubierta<\/strong>: las 4 esquinas a R80 mm/);
    expect(html).toContain("Plantilla R80 mm, tamaño real");
    const svg = cornerTemplateSvg(80);
    // Las unidades del SVG son milímetros reales: el arco tiene radio 80 y la regla mide 100.
    expect(svg).toMatch(/width="\d+mm" height="\d+mm"/);
    expect(svg).toContain("A80 80 0 0 1");
    expect(svg).toContain("h100");
    expect(cutSheetHtml(generateCabinet({ width: 800, height: 900, depth: 600 }), "Bajo")).not.toContain("Esquinas redondeadas");
  });

  it("el armado manda redondear antes de montar la cubierta, en muebles de tablero y de tubo", () => {
    const m = generateCabinet({ width: 1800, height: 900, depth: 600, drawers: 4, countertop: { cornerRadius: 80, roundAll: true }, joinery: "minifix" });
    for (const level of ["guided", "normal", "expert"] as const) {
      const plan = buildAssemblyPlan(m, level);
      const used = plan.steps.flatMap((s) => s.partIds);
      expect(used.filter((x) => x === "countertop"), level).toHaveLength(1);
      const sum = plan.steps.flatMap((s) => s.hardware).filter((h) => /cubierta/.test(h.name)).reduce((a, h) => a + h.qty, 0);
      expect(sum, level).toBe(m.hardware.find((h) => h.id === "countertop-screw")!.qty);
    }
    const guided = buildAssemblyPlan(m, "guided");
    const titles = guided.steps.map((s) => s.title);
    expect(titles.indexOf("Redondea las esquinas")).toBeGreaterThan(titles.indexOf("Para el mueble y escuádralo"));
    expect(titles.indexOf("Fija la cubierta")).toBe(titles.indexOf("Redondea las esquinas") + 1);
    const round = guided.steps.find((s) => s.title === "Redondea las esquinas")!;
    expect(round.actions[0]).toMatch(/las 4 esquinas de la cubierta \([A-Z]\) a R80 mm/);
    expect(round.actions.join(" ")).toMatch(/caladora dejando 2 mm por fuera/);
    const table = buildAssemblyPlan(generateFrame({ type: "table", width: 1200, height: 750, depth: 600, cornerRadius: 50 }), "normal").steps.map((s) => s.title);
    expect(table.indexOf("Redondea las esquinas")).toBe(table.indexOf("Fija la cubierta") - 1);
    expect(buildAssemblyPlan(generateFrame({ type: "table", width: 1200, height: 750, depth: 600 }), "normal").steps.some((s) => /Redondea/.test(s.title))).toBe(false);
  });

  it("se pide con palabras: al crear, y después sobre el mueble", () => {
    const { w, room, sel, wall } = setup();
    // Una isla siempre lleva cubierta; suelta y redondeada, van las cuatro esquinas.
    let r = say(w, sel, "isla de 180 x 90 x 60 con 4 cajones y esquinas redondeadas");
    expect(r.ok, r.message).toBe(true);
    expect(w.items[0].params.countertop).toEqual({ cornerRadius: 50, roundAll: true });
    const island: Selection = { kind: "item", itemId: w.items[0].id };
    r = say(w, island, "radio 8 cm");
    expect(r.message).toMatch(/cubierta que vuela 20 mm al frente, con las 4 esquinas redondeadas a R80 mm\. El despiece trae la plantilla/);
    say(w, island, "vuelo de 3 cm");
    expect(w.items[0].params.countertop).toEqual({ overhang: 30, cornerRadius: 80, roundAll: true });
    // El volumen que ocupa incluye el vuelo.
    const b = itemBox(room, w.items[0]);
    expect(b.max[2] - b.min[2]).toBe(600 + 18 + 30);
    say(w, island, "esquinas rectas");
    expect(w.items[0].params.countertop).toEqual({ overhang: 30 });
    expect(say(w, island, "sin cubierta").message).toMatch(/sin cubierta/);
    expect(itemModel(w.items[0]).panels.some((p) => p.id === "countertop")).toBe(false);

    // Contra un muro: solo las del frente, salvo que se pidan todas.
    r = say(w, wall, "gabinete de 120 x 90 x 60 con 2 puertas y cubierta a 20 cm de la izquierda");
    expect(r.ok, r.message).toBe(true);
    const base: Selection = { kind: "item", itemId: w.items[1].id };
    expect(w.items[1].params.countertop).toEqual({});
    expect(say(w, base, "esquinas redondeadas 40 mm").message).toMatch(/con las 2 esquinas del frente redondeadas a R40 mm/);
    say(w, base, "redondea las 4 esquinas");
    expect(w.items[1].params.countertop).toMatchObject({ cornerRadius: 50, roundAll: true });
    const bad = say(w, base, "radio 60 cm");
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/no cabe/);
    expect(w.items[1].params.countertop).toMatchObject({ cornerRadius: 50 });

    // Mesa de tubo: las cuatro esquinas de la cubierta.
    r = say(w, sel, "mesa de tubo de 140 x 75 x 70 con esquinas redondeadas 6 cm contra el muro sur");
    expect(r.ok, r.message).toBe(true);
    expect(w.items[2].frame).toMatchObject({ type: "table", cornerRadius: 60 });
    const table: Selection = { kind: "item", itemId: w.items[2].id };
    expect(say(w, table, "radio 10 cm").message).toMatch(/las 4 esquinas redondeadas a R100 mm/);
    expect(say(w, table, "radio 2 m").ok).toBe(false);
    expect(w.items[2].frame!.cornerRadius).toBe(100);
    say(w, table, "esquinas rectas");
    expect(w.items[2].frame!.cornerRadius).toBeUndefined();
    say(w, table, "sin tablero");
    expect(say(w, table, "esquinas redondeadas").message).toMatch(/no tiene cubierta/);

    const gltf = JSON.parse(exportGltf(w)) as { nodes: { name?: string; extras?: { handy?: { cornerRadiusMm?: number; roundedCorners?: string } } }[] };
    expect(gltf.nodes.find((n) => n.name === "Cubierta" && n.extras?.handy?.cornerRadiusMm)!.extras!.handy).toMatchObject({ cornerRadiusMm: 50, roundedCorners: "all" });
  });
});
