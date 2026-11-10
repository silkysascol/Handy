import { describe, expect, it } from "vitest";
import { addRoom, createWorld, placeCabinet, runCommand, toMm, type Selection, type World } from "../src/index.js";

function setup(): { w: World; wall: Selection } {
  const w = createWorld("Casa");
  addRoom(w, { name: "Sala", width: 4000, depth: 3000, height: 2400 });
  return { w, wall: { kind: "wall", roomId: "sala", wall: "north" } };
}

describe("toMm", () => {
  it("interpreta unidades y números sin unidad", () => {
    expect(toMm(2, "m")).toBe(2000);
    expect(toMm(80, "cm")).toBe(800);
    expect(toMm(800, "mm")).toBe(800);
    expect(toMm(2)).toBe(2000);
    expect(toMm(60)).toBe(600);
    expect(toMm(205)).toBe(2050);
    expect(toMm(900)).toBe(900);
  });
});

describe("comandos sobre un muro", () => {
  it("pon una puerta de 80 x 205 cm a 2 m de la pared izquierda", () => {
    const { w, wall } = setup();
    const r = runCommand(w, wall, "Pon una puerta de 80 x 205 cm a 2 m de la pared izquierda");
    expect(r.ok).toBe(true);
    expect(w.rooms[0].openings[0]).toMatchObject({ type: "door", wall: "north", offset: 2000, width: 800, height: 2050, sill: 0 });
    expect(r.select).toEqual({ kind: "opening", roomId: "sala", openingId: "door-north" });
    expect(r.message).toContain("a 2000 mm de la izquierda");
  });

  it("mide desde la derecha y centra por defecto", () => {
    const { w, wall } = setup();
    runCommand(w, wall, "ventana de 1,2 x 1 m a 50 cm de la derecha, antepecho 110");
    expect(w.rooms[0].openings[0]).toMatchObject({ type: "window", offset: 4000 - 500 - 1200, width: 1200, height: 1000, sill: 1100 });
    const r = runCommand(w, { kind: "wall", roomId: "sala", wall: "south" }, "una puerta");
    expect(w.rooms[0].openings[1]).toMatchObject({ wall: "south", offset: 1600, width: 800, height: 2050 });
    expect(r.message).toContain("centrada");
  });

  it("coloca un mueble con puertas y repisas", () => {
    const { w, wall } = setup();
    const r = runCommand(w, wall, "armario de 800 x 2000 x 500 a 60 cm de la derecha con 2 puertas y 3 repisas");
    expect(r.ok).toBe(true);
    expect(w.items[0]).toMatchObject({ name: "Armario", wall: "north", offset: 4000 - 600 - 800, params: { width: 800, height: 2000, depth: 500, doors: 2, shelves: 3, joinery: "minifix" } });
    expect(r.select).toEqual({ kind: "item", itemId: "armario" });
  });

  it("cambia el grosor y rechaza lo que no cabe", () => {
    const { w, wall } = setup();
    expect(runCommand(w, wall, "grosor 20 cm").ok).toBe(true);
    expect(w.rooms[0].wallThickness.north).toBe(200);
    const r = runCommand(w, wall, "puerta de 90 x 210 a 3,5 m de la izquierda");
    expect(r).toMatchObject({ ok: false, understood: true });
    expect(r.message).toContain("no cabe");
    expect(w.rooms[0].openings).toHaveLength(0);
  });

  it("devuelve understood: false cuando no reconoce la orden", () => {
    const { w, wall } = setup();
    expect(runCommand(w, wall, "píntalo de azul")).toMatchObject({ ok: false, understood: false });
  });
});

describe("comandos sobre un mueble", () => {
  function withItem() {
    const s = setup();
    placeCabinet(s.w, { roomId: "sala", wall: "north", offset: 1000, name: "Armario", params: { width: 800, height: 2000, depth: 500, doors: 2, shelves: 3 } });
    return { ...s, sel: { kind: "item", itemId: "armario" } as Selection };
  }

  it("cambia medidas de forma relativa y absoluta", () => {
    const { w, sel } = withItem();
    expect(runCommand(w, sel, "ensancha 10 cm").message).toContain("ancho 900 mm (antes 800)");
    runCommand(w, sel, "hazlo 20 cm más bajo");
    runCommand(w, sel, "fondo 45 cm");
    expect(w.items[0].params).toMatchObject({ width: 900, height: 1800, depth: 450 });
    runCommand(w, sel, "ancho 600");
    expect(w.items[0].params.width).toBe(600);
  });

  it("mueve, pega, centra y sube", () => {
    const { w, sel } = withItem();
    runCommand(w, sel, "muévelo 30 cm a la derecha");
    expect(w.items[0].offset).toBe(1300);
    runCommand(w, sel, "pégalo a la izquierda");
    expect(w.items[0].offset).toBe(0);
    runCommand(w, sel, "céntralo");
    expect(w.items[0].offset).toBe(1600);
    runCommand(w, sel, "a 50 cm de la derecha");
    expect(w.items[0].offset).toBe(4000 - 500 - 800);
    runCommand(w, sel, "súbelo 10 cm");
    expect(w.items[0].elevation).toBe(100);
    runCommand(w, sel, "al piso");
    expect(w.items[0].elevation).toBe(0);
  });

  it("repisas, puertas, unión y borrado", () => {
    const { w, sel } = withItem();
    runCommand(w, sel, "agrega una repisa");
    runCommand(w, sel, "una puerta");
    runCommand(w, sel, "sin tornillos a la vista");
    expect(w.items[0].params).toMatchObject({ shelves: 4, doors: 1, joinery: "minifix" });
    runCommand(w, sel, "quita 2 repisas");
    runCommand(w, sel, "sin puertas");
    expect(w.items[0].params).toMatchObject({ shelves: 2, doors: 0 });
    const r = runCommand(w, sel, "quítalo");
    expect(r.select).toBeNull();
    expect(w.items).toHaveLength(0);
  });

  it("un grupo de medidas sin unidad comparte escala y el zócalo se lee en mm", () => {
    const { w } = withItem();
    runCommand(w, { kind: "wall", roomId: "sala", wall: "south" }, "estante de 800 x 1800 x 250");
    expect(w.items[1].params).toMatchObject({ width: 800, height: 1800, depth: 250 });
    runCommand(w, { kind: "item", itemId: "armario" }, "zócalo 80");
    expect(w.items[0].params.plinthHeight).toBe(80);
    runCommand(w, { kind: "item", itemId: "armario" }, "zócalo de 10 cm");
    expect(w.items[0].params.plinthHeight).toBe(100);
  });

  it("no cambia nada si el resultado no cabe", () => {
    const { w, sel } = withItem();
    const r = runCommand(w, sel, "muévelo 3 m a la derecha");
    expect(r.ok).toBe(false);
    expect(w.items[0].offset).toBe(1000);
  });
});

describe("comandos sobre aberturas y habitaciones", () => {
  it("mueve, redimensiona y quita una puerta", () => {
    const { w, wall } = setup();
    runCommand(w, wall, "puerta de 80 x 205 a 1 m de la izquierda");
    const sel: Selection = { kind: "opening", roomId: "sala", openingId: "door-north" };
    runCommand(w, sel, "muévela 20 cm a la derecha");
    expect(w.rooms[0].openings[0].offset).toBe(1200);
    runCommand(w, sel, "90 x 210");
    expect(w.rooms[0].openings[0]).toMatchObject({ width: 900, height: 2100 });
    runCommand(w, sel, "céntrala");
    expect(w.rooms[0].openings[0].offset).toBe(1550);
    const r = runCommand(w, sel, "quítala");
    expect(w.rooms[0].openings).toHaveLength(0);
    expect(r.select).toEqual({ kind: "wall", roomId: "sala", wall: "north" });
  });

  it("cambia medidas de la habitación", () => {
    const { w } = setup();
    const sel: Selection = { kind: "room", roomId: "sala" };
    runCommand(w, sel, "alto 2,6 m");
    runCommand(w, sel, "ancho 4,5 m");
    expect(w.rooms[0]).toMatchObject({ height: 2600, width: 4500 });
    runCommand(w, sel, "3,6 x 3,2 m");
    expect(w.rooms[0]).toMatchObject({ width: 3600, depth: 3200 });
  });

  it("crea habitaciones sin nada seleccionado, una junto a otra", () => {
    const w = createWorld("Casa");
    const r = runCommand(w, { kind: "world" }, "cocina de 2,8 x 2,4 m");
    expect(r.select).toEqual({ kind: "room", roomId: "cocina" });
    expect(w.rooms[0]).toMatchObject({ name: "Cocina", width: 2800, depth: 2400, height: 2400, origin: [0, 0] });
    runCommand(w, { kind: "world" }, "habitación Estudio de 3 x 3 x 2,6 m");
    expect(w.rooms[1]).toMatchObject({ name: "Estudio", width: 3000, height: 2600, origin: [2800 + 150 + 150, 0] });
    expect(runCommand(w, { kind: "world" }, "hola")).toMatchObject({ understood: false });
  });
});
