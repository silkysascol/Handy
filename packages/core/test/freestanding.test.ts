import { describe, expect, it } from "vitest";
import {
  addOpening, addRoom, checkWorld, createWorld, describeWorld, dimensionsFor, exportGltf, itemBox, placeCabinet, rotateItem, runCommand, snapGap, updateItem,
  type Selection, type World,
} from "../src/index.js";

function setup() {
  const w = createWorld("Casa");
  const room = addRoom(w, { name: "Sala", width: 4000, depth: 3000, height: 2400 });
  return { w, room, sel: { kind: "room", roomId: room.id } as Selection, wall: (side: "north" | "east" | "south" | "west") => ({ kind: "wall", roomId: room.id, wall: side }) as Selection };
}
const say = (w: World, sel: Selection, text: string) => { const r = runCommand(w, sel, text); return r; };
const footprint = (w: World, i = 0) => { const b = itemBox(w.rooms[0], w.items[i]); return [b.min[0], b.min[2], b.max[0], b.max[2]]; };

describe("muebles sueltos en el cuarto", () => {
  it("con separación, el mueble queda dentro del cuarto, lejos de su muro, mirando hacia donde mira ese muro", () => {
    const { w, room } = setup();
    for (const [wall, expected] of [["north", [1000, 800, 2200, 1400]], ["south", [1800, 1600, 3000, 2200]], ["east", [2600, 1000, 3200, 2200]], ["west", [800, 800, 1400, 2000]]] as const) {
      const item = placeCabinet(w, { roomId: room.id, wall, offset: 1000, gap: 800, params: { width: 1200, height: 750, depth: 600 } });
      const b = itemBox(room, item);
      expect([b.min[0], b.min[2], b.max[0], b.max[2]], wall).toEqual(expected);
      w.items.length = 0;
    }
    // No se sale por el muro de enfrente.
    expect(() => placeCabinet(w, { roomId: room.id, wall: "north", offset: 0, gap: 2500, params: { width: 1200, height: 750, depth: 600 } })).toThrow(/No cabe: separado 2500 mm/);
    expect(() => placeCabinet(w, { roomId: room.id, wall: "north", offset: 0, gap: -10, params: { width: 1200, height: 750, depth: 600 } })).toThrow(/No cabe/);
  });

  it("con la habitación seleccionada, un mueble pedido va al centro; con un muro nombrado, contra ese muro", () => {
    const { w, sel } = setup();
    let r = say(w, sel, "mesa de tubo de 120 x 75 x 60");
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toMatch(/a 1200 mm del muro norte de Sala y a 1400 mm de su izquierda, mirando al sur/);
    expect(w.items[0]).toMatchObject({ wall: "north", offset: 1400, gap: 1200 });
    expect(footprint(w)).toEqual([1400, 1200, 2600, 1800]);
    expect(r.select).toEqual({ kind: "item", itemId: w.items[0].id });

    r = say(w, sel, "isla de 180 x 90 x 60 con 4 cajones");
    expect(r.ok, r.message).toBe(true);
    expect(w.items[1].name).toBe("Isla");
    expect(w.items[1].gap).toBe(Math.round((3000 - 618) / 2));

    r = say(w, sel, "armario de 80 x 200 x 50 contra el muro sur a 20 cm de la izquierda");
    expect(r.ok, r.message).toBe(true);
    expect(w.items[2]).toMatchObject({ wall: "south", offset: 200 });
    expect(w.items[2].gap).toBeUndefined();
    // El piso se sigue entendiendo como piso.
    expect(say(w, sel, "piso de porcelanato 60 x 60").message).toMatch(/Necesitas/);
  });

  it("desde un muro: separado una distancia, o a tantos metros del muro", () => {
    const { w, wall } = setup();
    let r = say(w, wall("west"), "mesa de tubo de 120 x 75 x 60 separada 80 cm, a 50 cm de la izquierda");
    expect(r.ok, r.message).toBe(true);
    expect(w.items[0]).toMatchObject({ wall: "west", offset: 500, gap: 800 });
    r = say(w, wall("north"), "estantería metálica de 100 x 180 x 40 a 1 m del muro");
    expect(r.ok, r.message).toBe(true);
    expect(w.items[1]).toMatchObject({ wall: "north", gap: 1000 });
    // "a 1 m de la pared izquierda" sigue siendo posición a lo largo del muro, no separación.
    r = say(w, wall("south"), "armario de 80 x 200 x 50 a 1 m de la pared izquierda");
    expect(w.items[2]).toMatchObject({ wall: "south", offset: 1000 });
    expect(w.items[2].gap).toBeUndefined();
  });

  it("un mueble se separa, se acerca, se aleja, se centra y se pega con palabras", () => {
    const { w, wall } = setup();
    say(w, wall("north"), "mesa de tubo de 120 x 75 x 60 a 50 cm de la izquierda");
    const sel: Selection = { kind: "item", itemId: w.items[0].id };
    const it = () => w.items[0];
    expect(it().gap).toBeUndefined();

    expect(say(w, sel, "sepáralo 60 cm").message).toMatch(/ahora a 600 mm del muro norte\. Quedan 1800 mm hasta el muro de enfrente/);
    expect(it().gap).toBe(600);
    expect(say(w, sel, "aléjalo 20 cm").ok).toBe(true);
    expect(it().gap).toBe(800);
    expect(say(w, sel, "acércalo 50 cm").ok).toBe(true);
    expect(it().gap).toBe(300);
    expect(say(w, sel, "ponlo a 1,2 m del muro").ok).toBe(true);
    expect(it().gap).toBe(1200);
    // Mover a los lados no cambia la separación.
    expect(say(w, sel, "muévelo 30 cm a la derecha").ok).toBe(true);
    expect([it().offset, it().gap]).toEqual([800, 1200]);
    expect(say(w, sel, "en el centro del cuarto").message).toMatch(/en el centro de Sala/);
    expect([it().offset, it().gap]).toEqual([1400, 1200]);
    expect(say(w, sel, "pégalo al muro").message).toMatch(/pegado al muro norte/);
    expect(it().gap).toBeUndefined();
    // "pégalo a la izquierda" sigue siendo a lo largo del muro.
    expect(say(w, sel, "pégalo a la izquierda").ok).toBe(true);
    expect(it().offset).toBe(0);
    // Lo que no cabe no cambia nada.
    const r = say(w, sel, "sepáralo 2,8 m");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/No cabe: separado 2800 mm/);
    expect(it().gap).toBeUndefined();
  });

  it("girar conserva el centro; pasar a otro muro lo deja pegado y centrado", () => {
    const { w, sel } = setup();
    say(w, sel, "mesa de tubo de 120 x 75 x 60");
    const item: Selection = { kind: "item", itemId: w.items[0].id };
    const center = () => { const [x0, z0, x1, z1] = footprint(w); return [(x0 + x1) / 2, (z0 + z1) / 2]; };
    expect(center()).toEqual([2000, 1500]);
    let r = say(w, item, "gíralo");
    expect(r.message).toMatch(/girado, ahora mira al oeste/);
    expect(w.items[0].wall).toBe("east");
    expect(footprint(w)).toEqual([1700, 900, 2300, 2100]);
    expect(center()).toEqual([2000, 1500]);
    say(w, item, "dale media vuelta");
    expect(w.items[0].wall).toBe("west");
    expect(center()).toEqual([2000, 1500]);
    say(w, item, "gíralo a la izquierda");
    expect(w.items[0].wall).toBe("south");
    for (let i = 0; i < 4; i++) rotateItem(w, w.items[0].id);
    expect(w.items[0].wall).toBe("south");
    expect(center()).toEqual([2000, 1500]);

    // Girado junto a un muro se corre lo justo para caber.
    updateItem(w, w.items[0].id, { wall: "north", offset: 0, gap: 0 });
    rotateItem(w, w.items[0].id);
    const [x0, z0, x1, z1] = footprint(w);
    expect(x0).toBeGreaterThanOrEqual(0); expect(z0).toBeGreaterThanOrEqual(0); expect(x1).toBeLessThanOrEqual(4000); expect(z1).toBeLessThanOrEqual(3000);

    r = say(w, item, "pásalo al muro oeste");
    expect(r.message).toMatch(/contra el muro oeste, de 900 a 2100 mm, mirando al este/);
    expect(w.items[0]).toMatchObject({ wall: "west", offset: 900 });
    expect(w.items[0].gap).toBeUndefined();
    // Un mueble más largo que el cuarto no cabe girado.
    const big = placeCabinet(w, { roomId: w.rooms[0].id, wall: "north", offset: 300, params: { width: 3400, height: 900, depth: 500 } });
    expect(() => rotateItem(w, big.id)).toThrow(/no cabe girado/);
    expect(big.wall).toBe("north");
  });

  it("avisa de pasillos angostos, de puertas con poco espacio al frente y de solapes", () => {
    const { w, room, sel } = setup();
    addOpening(w, room.id, { wall: "south", type: "door", offset: 1600, width: 800, height: 2050 });
    say(w, sel, "mesa de tubo de 120 x 75 x 60");
    const id = w.items[0].id;
    const codes = () => checkWorld(w).filter((i) => i.itemId === id).map((i) => i.code);
    // En el centro: 1200 mm a cada lado, frente a la puerta sobra espacio.
    expect(codes()).toEqual([]);
    // A 400 mm del muro norte: pasillo angosto.
    updateItem(w, id, { gap: 400 });
    expect(checkWorld(w).find((i) => i.code === "tight-passage")!.message).toMatch(/Entre Mesa de tubo y el muro norte queda un paso de 400 mm/);
    // A 100 mm del muro no es un pasillo: no se avisa.
    updateItem(w, id, { gap: 100 });
    expect(codes()).toEqual([]);
    // Frente a la puerta del sur, a 700 mm: se puede pasar pero no entrar cómodo.
    updateItem(w, id, { gap: 3000 - 600 - 700 });
    expect(checkWorld(w).find((i) => i.code === "door-clearance")!.message).toMatch(/deja solo 700 mm frente a la puerta del muro sur/);
    // Pegada a la puerta desde adentro: la tapa, aunque su muro de referencia sea el norte.
    updateItem(w, id, { gap: 3000 - 600 });
    expect(codes()).toContain("blocks-door");
    // Dos muebles sueltos frente a frente con 300 mm entre ellos.
    updateItem(w, id, { gap: 600 });
    const other = placeCabinet(w, { roomId: room.id, wall: "north", offset: 1400, gap: 1500, params: { width: 1200, height: 750, depth: 600 } });
    const between = checkWorld(w).filter((i) => i.code === "tight-passage" && /y Gabinete 1200|y Mesa de tubo/.test(i.message));
    expect(between).toHaveLength(1);
    expect(between[0].message).toMatch(/queda un paso de 300 mm/);
    updateItem(w, other.id, { gap: 900 });
    expect(checkWorld(w).some((i) => i.code === "items-overlap")).toBe(true);
  });

  it("cotas, imán, descripción y exportación conocen la separación", () => {
    const { w, sel } = setup();
    say(w, sel, "mesa de tubo de 120 x 75 x 60");
    const id = w.items[0].id;
    const gaps = dimensionsFor(w, { kind: "item", itemId: id }).filter((d) => d.kind === "gap").map((d) => d.value).sort((a, b) => a - b);
    expect(gaps).toEqual([1200, 1200, 1400, 1400]); // espalda al muro, frente al muro de enfrente, y los dos lados
    expect(snapGap(w, id, 30)).toBe(0); // imán al muro
    expect(snapGap(w, id, 1170)).toBe(1200); // imán al centro
    expect(snapGap(w, id, 2390)).toBe(2400); // imán al muro de enfrente
    expect(snapGap(w, id, 5000)).toBe(2400);
    expect(snapGap(w, id, 733)).toBe(730);
    expect(describeWorld(w)).toMatch(/Mesa de tubo .* suelta, separada 1200 del muro/);
    const gltf = JSON.parse(exportGltf(w)) as { nodes: { name?: string; translation?: number[] }[] };
    const node = gltf.nodes.find((n) => n.name === "Mesa de tubo")!;
    expect(node.translation![2]).toBeCloseTo(1.2, 5);
  });
});
