import { describe, expect, it } from "vitest";
import {
  addBlock, addOpening, addRoom, blockBox, checkWorld, createWorld, describeWorld, dimensionsFor, exportGltf, freeWallRuns, placeCabinet, planFloor, removeBlock, roomArea,
  runCommand, snapAlongWall, updateBlock, updateRoom, defaultFloorSpec, type Selection, type World,
} from "../src/index.js";

function setup() {
  const w = createWorld("Casa");
  const room = addRoom(w, { name: "Sala", width: 5000, depth: 4000, height: 2400 });
  return { w, room, sel: { kind: "room", roomId: room.id } as Selection };
}
const say = (w: World, sel: Selection, text: string) => runCommand(w, sel, text);

describe("columnas, buitrones y esquinas cerradas", () => {
  it("una esquina cerrada vuelve la habitación una L: menos piso, menos muro libre", () => {
    const { w, room, sel } = setup();
    const r = say(w, sel, "recorta la esquina noreste 2 x 1,5 m");
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toMatch(/Esquina cerrada de 2000 x 1500 mm, hasta el techo, a 3000 mm del muro oeste y 0 mm del muro norte .* Sala queda con 17,0 m² de piso/);
    expect(r.select).toEqual({ kind: "block", roomId: room.id, blockId: "esquina-cerrada" });
    expect(room.blocks).toEqual([{ id: "esquina-cerrada", name: "Esquina cerrada", x: 3000, z: 0, width: 2000, depth: 1500 }]);
    expect(roomArea(room)).toBe(5000 * 4000 - 2000 * 1500);
    const runs = freeWallRuns(w, room.id);
    expect(runs.filter((x) => x.wall === "north")).toEqual([{ wall: "north", from: 0, to: 3000, length: 3000 }]);
    expect(runs.filter((x) => x.wall === "east")).toEqual([{ wall: "east", from: 1500, to: 4000, length: 2500 }]);
    expect(blockBox(room, room.blocks![0])).toEqual({ min: [3000, 0, 0], max: [5000, 2400, 1500] });
    // Sin decir cuál esquina, pregunta.
    expect(say(w, sel, "hazla en L").message).toMatch(/Dime cuál esquina/);
    expect(room.blocks).toHaveLength(1);
  });

  it("una columna se pone por distancias a los muros, centrada o en una esquina", () => {
    const { w, room, sel } = setup();
    let r = say(w, sel, "columna de 30 x 40 a 2 m del muro oeste y 1 m del muro norte");
    expect(r.ok, r.message).toBe(true);
    expect(room.blocks![0]).toMatchObject({ name: "Columna", x: 2000, z: 1000, width: 300, depth: 400 });
    r = say(w, sel, "buitrón de 60 x 40 en la esquina suroeste");
    expect(room.blocks![1]).toMatchObject({ name: "Buitrón", x: 0, z: 3600 });
    r = say(w, sel, "columna de 30 x 30 pegada al muro sur a 1,5 m del muro este");
    expect(room.blocks![2]).toMatchObject({ id: "columna-2", x: 5000 - 300 - 1500, z: 3700 });
    r = say(w, sel, "muro bajo de 150 x 12 a 2 m del muro norte");
    expect(r.ok, r.message).toBe(true);
    expect(room.blocks![3]).toMatchObject({ name: "Muro bajo", width: 1500, depth: 120, height: 900, x: 1750, z: 2000 });
    // No se cruzan entre sí ni se salen de la habitación.
    expect(say(w, sel, "columna de 30 x 30 a 2,1 m del muro oeste y 1,1 m del muro norte").message).toMatch(/se cruza con Columna/);
    expect(say(w, sel, "columna de 30 x 30 a 4,9 m del muro oeste").message).toMatch(/No cabe/);
    expect(say(w, sel, "recorta la esquina noreste 4 x 3,5 m").message).toMatch(/más de la mitad/);
    expect(room.blocks).toHaveLength(4);
    expect(describeWorld(w)).toMatch(/- Buitrón \(id: buitron\): 600 x 400, hasta el techo, x 0–600, z 3600–4000/);
  });

  it("una columna seleccionada se mueve, cambia de tamaño y se quita con palabras", () => {
    const { w, room, sel } = setup();
    say(w, sel, "columna de 30 x 30 a 2 m del muro oeste y 1 m del muro norte");
    const col: Selection = { kind: "block", roomId: room.id, blockId: "columna" };
    const b = () => room.blocks![0];
    expect(say(w, col, "muévela 20 cm al este").ok).toBe(true);
    expect([b().x, b().z]).toEqual([2200, 1000]);
    say(w, col, "muévela 50 cm al sur");
    expect([b().x, b().z]).toEqual([2200, 1500]);
    say(w, col, "a 1 m del muro este");
    expect([b().x, b().z]).toEqual([3700, 1500]);
    say(w, col, "40 x 60");
    expect([b().width, b().depth]).toEqual([400, 600]);
    say(w, col, "alto 1 m");
    expect(b().height).toBe(1000);
    say(w, col, "hasta el techo");
    expect(b().height).toBeUndefined();
    say(w, col, "céntrala");
    expect([b().x, b().z]).toEqual([2300, 1700]);
    const bad = say(w, col, "muévela 9 m al este");
    expect(bad.ok).toBe(false);
    expect([b().x, b().z]).toEqual([2300, 1700]);
    expect(say(w, col, "píntala de rojo").understood).toBe(false);
    const gone = say(w, col, "quítala");
    expect(gone.select).toEqual({ kind: "room", roomId: room.id });
    expect(room.blocks).toBeUndefined();
  });

  it("no tapa puertas ni ventanas, y la habitación no se encoge por debajo de una columna", () => {
    const { w, room } = setup();
    addOpening(w, room.id, { wall: "north", type: "door", offset: 500, width: 900, height: 2050 });
    addOpening(w, room.id, { wall: "east", type: "window", offset: 1000, width: 1200, height: 1200, sill: 1000 });
    expect(() => addBlock(w, room.id, { x: 800, z: 0, width: 400, depth: 400 })).toThrow(/taparía la puerta del muro norte/);
    expect(() => addBlock(w, room.id, { x: 4700, z: 1500, width: 300, depth: 300 })).toThrow(/taparía la ventana del muro este/);
    // Un muro bajo bajo el antepecho de la ventana sí cabe.
    const low = addBlock(w, room.id, { name: "Muro bajo", x: 4700, z: 1500, width: 300, depth: 300, height: 900 });
    expect(() => updateBlock(w, room.id, low.id, { height: null })).toThrow(/taparía la ventana/);
    expect(low.height).toBe(900);
    const col = addBlock(w, room.id, { x: 4000, z: 3000, width: 300, depth: 300 });
    expect(() => updateRoom(w, room.id, { width: 4200 })).toThrow(/ya no cabe/);
    expect(removeBlock(w, room.id, col.id)).toBe(true);
    expect(removeBlock(w, room.id, "nada")).toBe(false);
  });

  it("los muebles chocan con las columnas, también al abrir, y un mueble suelto avisa si deja poco paso", () => {
    const { w, room } = setup();
    addBlock(w, room.id, { x: 1000, z: 0, width: 300, depth: 300 });
    const inside = placeCabinet(w, { roomId: room.id, wall: "north", offset: 800, params: { width: 800, height: 2000, depth: 500, doors: 2 } });
    expect(checkWorld(w).find((i) => i.code === "hits-block")!.message).toBe("Gabinete 800 se mete en Columna en Sala.");
    // Corrido justo al lado ya no se mete, pero la puerta pega contra la columna al abrir.
    w.items[0].offset = 1300;
    const issues = checkWorld(w).filter((i) => i.itemId === inside.id);
    expect(issues.some((i) => i.code === "hits-block")).toBe(false);
    w.items.length = 0;
    addBlock(w, room.id, { name: "Columna", x: 2500, z: 2000, width: 300, depth: 300 });
    placeCabinet(w, { roomId: room.id, wall: "north", offset: 2000, gap: 1000, params: { width: 1200, height: 750, depth: 600 } });
    expect(checkWorld(w).find((i) => i.code === "tight-passage")!.message).toMatch(/Entre Gabinete 1200 y Columna queda un paso de 400 mm/);
    // El imán del arrastre conoce los bordes de la columna.
    expect(snapAlongWall(w, room.id, "north", 800, 1320)).toBe(1300);
    expect(snapAlongWall(w, room.id, "north", 800, 190)).toBe(200);
  });

  it("el piso descuenta lo que ocupan, recorta lo que las bordea y suma su guardaescobas", () => {
    const { room } = setup();
    const spec = { ...defaultFloorSpec(), tileWidth: 500, tileLength: 500, joint: 0, start: "corner" as const };
    const plain = planFloor(room, spec);
    expect([plain.areaM2, plain.fullTiles, plain.cutTiles, plain.skirtingM]).toEqual([20, 80, 0, 18]);
    // Esquina cerrada de 2 x 1,5 m alineada con las baldosas: 12 piezas menos, ningún recorte.
    room.blocks = [{ id: "e", name: "Esquina cerrada", x: 3000, z: 0, width: 2000, depth: 1500 }];
    const ell = planFloor(room, spec);
    expect([ell.areaM2, ell.fullTiles, ell.cutTiles]).toEqual([17, 68, 0]);
    expect(ell.skirtingM).toBe(18); // una L tiene el mismo perímetro que su rectángulo
    // Columna de 30 x 30 en medio de una baldosa: no quita piezas, recorta una.
    room.blocks = [{ id: "c", name: "Columna", x: 1100, z: 1100, width: 300, depth: 300 }];
    const col = planFloor(room, spec);
    expect([col.fullTiles, col.cutTiles, col.tilesNeeded]).toEqual([79, 1, 80]);
    expect(col.tiles.filter((t) => t.notch)).toHaveLength(1);
    expect(col.skirtingM).toBe(19.2);
    expect(col.areaM2).toBe(19.91);
    expect(col.notes.join(" ")).toMatch(/1 pieza\(s\) se recortan alrededor de columnas/);
  });

  it("cotas y exportación a Blender incluyen los macizos", () => {
    const { w, room, sel } = setup();
    say(w, sel, "columna de 30 x 40 a 2 m del muro oeste y 1 m del muro norte");
    const dims = dimensionsFor(w, { kind: "block", roomId: room.id, blockId: "columna" });
    expect(dims.filter((d) => d.kind === "gap").map((d) => d.value).sort((a, b) => a - b)).toEqual([1000, 2000, 2600, 2700]);
    expect(dims.filter((d) => d.kind === "size").map((d) => d.value).sort((a, b) => a - b)).toEqual([300, 400]);
    const gltf = JSON.parse(exportGltf(w)) as { nodes: { name?: string; translation?: number[]; scale?: number[]; extras?: { handy?: { block?: string; areaM2?: number } } }[] };
    const node = gltf.nodes.find((n) => n.extras?.handy?.block === "columna")!;
    expect(node.name).toBe("Columna");
    expect(gltf.nodes.find((n) => n.name === "Piso")!.extras!.handy!.areaM2).toBeCloseTo(19.88, 5);
  });
});
