import type { AABB } from "./collision.js";
import { panelBox, panelInstances } from "./collision.js";
import { effectiveOpenings, itemModel, itemTransform, wallLength, WALL_NAMES, type Opening, type Room, type WallSide, type World } from "./world.js";

/**
 * Exporta el mundo a glTF 2.0 (un solo archivo .gltf con el buffer embebido) para abrirlo en Blender,
 * three.js, Unity, Godot, etc. Unidades en metros, Y arriba. Cada muro, piso y pieza de mueble es un
 * nodo con nombre legible, y las medidas en mm van en `extras`.
 */

type Vec3 = [number, number, number];
interface GltfNode { name: string; mesh?: number; translation?: Vec3; rotation?: [number, number, number, number]; scale?: Vec3; children?: number[]; extras?: Record<string, unknown> }

const PALETTE: Record<string, [number, number, number]> = {
  wall: [0.86, 0.85, 0.82],
  floor: [0.55, 0.53, 0.5],
  white: [0.93, 0.92, 0.89],
  hdf: [0.88, 0.87, 0.84],
  wood: [0.72, 0.54, 0.35],
  metal: [0.62, 0.64, 0.66],
};

function base64(bytes: Uint8Array): string {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    out += abc[a >> 2] + abc[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? abc[((b & 15) << 2) | (c >> 6)] : "=") + (i + 2 < bytes.length ? abc[c & 63] : "=");
  }
  return out;
}

/** Cubo unitario centrado en el origen: 24 vértices con normales y 36 índices. */
function unitCube(): { positions: Float32Array; normals: Float32Array; indices: Uint16Array } {
  const faces: { n: Vec3; u: Vec3; v: Vec3 }[] = [
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  ];
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  faces.forEach((f, i) => {
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      positions.push(...([0, 1, 2].map((k) => 0.5 * (f.n[k] + su * f.u[k] + sv * f.v[k])) as Vec3));
      normals.push(...f.n);
    }
    indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint16Array(indices) };
}

const M = 0.001;
const mm = (v: number) => Math.round(v * M * 1e6) / 1e6;

function materialKey(materialId: string): string {
  const id = materialId.toLowerCase();
  if (id.includes("hdf")) return "hdf";
  if (id.includes("roble") || id.includes("oak") || id.includes("wood") || id.includes("madera")) return "wood";
  return "white";
}

/** Rectángulos macizos de un muro (u a lo largo del muro, y en altura) descontando puertas y ventanas. */
export function wallRects(room: Room, wall: WallSide, openings: Opening[] = room.openings.filter((o) => o.wall === wall)): { u0: number; u1: number; y0: number; y1: number }[] {
  const len = wallLength(room, wall), H = room.height;
  const ops = [...openings].sort((a, b) => a.offset - b.offset);
  const rects: { u0: number; u1: number; y0: number; y1: number }[] = [];
  let cursor = 0;
  for (const o of ops) {
    if (o.offset > cursor) rects.push({ u0: cursor, u1: o.offset, y0: 0, y1: H });
    if (o.sill > 0) rects.push({ u0: o.offset, u1: o.offset + o.width, y0: 0, y1: o.sill });
    if (o.sill + o.height < H) rects.push({ u0: o.offset, u1: o.offset + o.width, y0: o.sill + o.height, y1: H });
    cursor = Math.max(cursor, o.offset + o.width);
  }
  if (cursor < len) rects.push({ u0: cursor, u1: len, y0: 0, y1: H });
  return rects;
}

export function wallRectToBox(room: Room, wall: WallSide, r: { u0: number; u1: number; y0: number; y1: number }): AABB {
  const [ox, oz] = room.origin;
  const t = room.wallThickness[wall];
  switch (wall) {
    case "north": return { min: [ox + r.u0, r.y0, oz - t], max: [ox + r.u1, r.y1, oz] };
    case "south": return { min: [ox + room.width - r.u1, r.y0, oz + room.depth], max: [ox + room.width - r.u0, r.y1, oz + room.depth + t] };
    case "east": return { min: [ox + room.width, r.y0, oz + r.u0], max: [ox + room.width + t, r.y1, oz + r.u1] };
    case "west": return { min: [ox - t, r.y0, oz + room.depth - r.u1], max: [ox, r.y1, oz + room.depth - r.u0] };
  }
}

export function exportGltf(world: World): string {
  const cube = unitCube();
  const bytes = new Uint8Array(cube.positions.byteLength + cube.normals.byteLength + cube.indices.byteLength);
  bytes.set(new Uint8Array(cube.positions.buffer), 0);
  bytes.set(new Uint8Array(cube.normals.buffer), cube.positions.byteLength);
  bytes.set(new Uint8Array(cube.indices.buffer), cube.positions.byteLength + cube.normals.byteLength);

  const materialKeys = Object.keys(PALETTE);
  const nodes: GltfNode[] = [];
  const add = (n: GltfNode): number => nodes.push(n) - 1;
  const boxNode = (name: string, box: AABB, material: string, extras?: Record<string, unknown>): number =>
    add({
      name,
      mesh: materialKeys.indexOf(material),
      translation: [mm((box.min[0] + box.max[0]) / 2), mm((box.min[1] + box.max[1]) / 2), mm((box.min[2] + box.max[2]) / 2)],
      scale: [mm(box.max[0] - box.min[0]), mm(box.max[1] - box.min[1]), mm(box.max[2] - box.min[2])],
      extras,
    });

  const roomNodes: number[] = [];
  for (const room of world.rooms) {
    const [ox, oz] = room.origin;
    const t = room.wallThickness;
    const wallNodes: number[] = [];
    for (const wall of ["north", "east", "south", "west"] as WallSide[]) {
      if (t[wall] <= 0) continue; // muro compartido: lo dibuja la habitación dueña
      wallRects(room, wall, effectiveOpenings(world, room, wall)).forEach((r, i) => wallNodes.push(boxNode(`${WALL_NAMES[wall]} ${i + 1}`, wallRectToBox(room, wall, r), "wall", { handy: { wall, thicknessMm: t[wall] } })));
    }
    // Esquinas: prolongan los muros norte y sur sobre el grosor de este y oeste.
    const corner = (name: string, x0: number, x1: number, z0: number, z1: number) => x1 > x0 && z1 > z0 && wallNodes.push(boxNode(name, { min: [x0, 0, z0], max: [x1, room.height, z1] }, "wall"));
    corner("esquina noroeste", ox - t.west, ox, oz - t.north, oz);
    corner("esquina noreste", ox + room.width, ox + room.width + t.east, oz - t.north, oz);
    corner("esquina suroeste", ox - t.west, ox, oz + room.depth, oz + room.depth + t.south);
    corner("esquina sureste", ox + room.width, ox + room.width + t.east, oz + room.depth, oz + room.depth + t.south);

    const floor = boxNode("Piso", { min: [ox - t.west, -100, oz - t.north], max: [ox + room.width + t.east, 0, oz + room.depth + t.south] }, "floor", { handy: { areaM2: (room.width * room.depth) / 1e6 } });
    const walls = add({ name: "Muros", children: wallNodes });

    const itemNodes: number[] = [];
    for (const item of world.items.filter((i) => i.roomId === room.id)) {
      const tr = itemTransform(room, item);
      const model = itemModel(item);
      const parts: number[] = [];
      for (const p of model.panels) {
        const units = panelInstances(p);
        units.forEach((u, i) => {
          const box = panelBox(p, u.placement);
          if (!box) return;
          parts.push(boxNode(units.length > 1 ? `${p.name} ${i + 1}` : p.name, box, materialKey(p.materialId), { handy: { panelId: p.id, lengthMm: p.height, widthMm: p.width, thicknessMm: p.thickness, materialId: p.materialId, edges: p.edgeBanding } }));
        });
      }
      for (const b of model.bars ?? []) b.boxes.forEach((bx, i) => parts.push(boxNode(b.boxes.length > 1 ? `${b.name} ${i + 1}` : b.name, bx, "metal", { handy: { barId: b.id, profileId: b.profileId, lengthMm: b.length } })));
      for (const f of model.fixtures ?? []) parts.push(boxNode(f.name, f.box, "metal", { handy: { fixtureId: f.id, kind: f.kind } }));
      const half = (tr.rotationY * Math.PI) / 360;
      itemNodes.push(add({
        name: item.name,
        translation: [mm(tr.position[0]), mm(tr.position[1]), mm(tr.position[2])],
        rotation: [0, Math.round(Math.sin(half) * 1e6) / 1e6, 0, Math.round(Math.cos(half) * 1e6) / 1e6],
        children: parts,
        extras: { handy: { itemId: item.id, params: item.params, wall: item.wall, offsetMm: item.offset } },
      }));
    }
    const children = [walls, floor];
    if (itemNodes.length) children.push(add({ name: "Muebles", children: itemNodes }));
    roomNodes.push(add({ name: room.name, children, extras: { handy: { roomId: room.id, widthMm: room.width, depthMm: room.depth, heightMm: room.height } } }));
  }
  const root = add({ name: `Handy · ${world.name}`, children: roomNodes });

  const posLen = cube.positions.byteLength, norLen = cube.normals.byteLength, idxLen = cube.indices.byteLength;
  const gltf = {
    asset: { version: "2.0", generator: "Handy" },
    scene: 0,
    scenes: [{ name: world.name, nodes: [root] }],
    nodes,
    meshes: materialKeys.map((k, i) => ({ name: `caja-${k}`, primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: i }] })),
    materials: materialKeys.map((k) => ({ name: k, pbrMetallicRoughness: { baseColorFactor: [...PALETTE[k], 1], metallicFactor: 0, roughnessFactor: k === "floor" ? 0.9 : 0.7 } })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: "VEC3", min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posLen, target: 34962 },
      { buffer: 0, byteOffset: posLen, byteLength: norLen, target: 34962 },
      { buffer: 0, byteOffset: posLen + norLen, byteLength: idxLen, target: 34963 },
    ],
    buffers: [{ byteLength: bytes.byteLength, uri: `data:application/octet-stream;base64,${base64(bytes)}` }],
  };
  return JSON.stringify(gltf, null, 1);
}
