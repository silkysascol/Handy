import { describe, expect, it } from "vitest";
import { generateCabinet, checkMotionCollisions, panelBox, boxAt, type Obstacle, type Panel } from "../src/index.js";

const wallLeft: Obstacle = { id: "wall-left", name: "muro izquierdo", box: { min: [-200, 0, -1000], max: [0, 2600, 3000] } };

describe("checkMotionCollisions", () => {
  it("una puerta de 110° pegada a un muro choca pasados los 90°", () => {
    const m = generateCabinet({ width: 600, height: 700, depth: 350, doors: 1 });
    const hits = checkMotionCollisions(m, [wallLeft]);
    expect(hits).toHaveLength(1);
    expect(hits[0].againstId).toBe("wall-left");
    expect(hits[0].angleDeg).toBeGreaterThan(90);
    expect(hits[0].message).toContain("muro izquierdo");
  });

  it("con bisagra de 90° no hay choque", () => {
    const m = generateCabinet({ width: 600, height: 700, depth: 350, doors: 1 });
    const door = m.panels.find((p) => p.id === "door")!;
    door.motion = { kind: "hinge", axis: "left", maxAngleDeg: 90 };
    expect(checkMotionCollisions(m, [wallLeft])).toHaveLength(0);
  });

  it("sin obstáculos la puerta no choca con el propio mueble", () => {
    const m = generateCabinet({ width: 800, height: 2000, depth: 500, shelves: 3, doors: 2 });
    expect(checkMotionCollisions(m)).toHaveLength(0);
  });

  it("un cajón choca con la puerta abierta de un lavavajillas vecino", () => {
    const m = generateCabinet({ width: 600, height: 700, depth: 500 });
    const drawer: Panel = {
      id: "drawer-1", name: "Cajón 1", height: 150, width: 450, thickness: 16, materialId: "melamine-18-white", qty: 1,
      grain: "none", edgeBanding: { top: false, bottom: false, left: false, right: false },
      placement: { x: 60, y: 300, z: 30, normal: "z" },
      motion: { kind: "slide", direction: "front", travel: 450 },
    };
    // Basta con el frente del cajón para la prueba: 450 de ancho (x), 150 de alto (y), 16 en z.
    m.panels.push(drawer);
    const dishwasherDoor: Obstacle = { id: "dw-door", name: "puerta del lavavajillas abierta", box: { min: [0, 0, 500], max: [600, 120, 1100] } };
    // La puerta abierta queda baja (120 mm) y el cajón va a 300 mm: no debe chocar.
    expect(checkMotionCollisions(m, [dishwasherDoor])).toHaveLength(0);
    // Un obstáculo a la altura del cajón, unos 185 mm delante del frente, sí choca a esa distancia.
    const box: Obstacle = { id: "box", name: "caja en el piso", box: { min: [0, 250, 230], max: [600, 400, 400] } };
    const hits = checkMotionCollisions(m, [box]);
    expect(hits).toHaveLength(1);
    expect(hits[0].travel).toBeGreaterThanOrEqual(150);
    expect(hits[0].travel).toBeLessThanOrEqual(220);
  });
});

describe("boxAt", () => {
  it("un giro de 90° sobre el eje izquierdo lleva la puerta hacia +z", () => {
    const m = generateCabinet({ width: 600, height: 700, depth: 350, doors: 1 });
    const door = m.panels.find((p) => p.id === "door")!;
    const rest = panelBox(door)!;
    const open = boxAt(door, rest, { kind: "hinge", axis: "left", maxAngleDeg: 90 }, 1);
    expect(open.max[2]).toBeGreaterThan(rest.max[2] + 500);
    expect(Math.abs(open.max[0] - open.min[0])).toBeLessThanOrEqual(door.thickness + 1);
  });
});
