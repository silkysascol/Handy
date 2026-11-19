import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  activeProviders, adjacentWall, blockBox, roomArea, clock, compassName, parseSunQuery, sunPatch, sunPosition, sunReport, sunVector, wallBearing, REFERENCE_DAYS, drillBands, electricalTakeoff, pointPosition, createPriceBook, effectiveOpenings, isPriceBook, isPriceCommand, needKey, priceAgeDays, runPriceCommand, checkWorld, createWorld, cutSheetHtml, dimensionsFor, exportGltf, freeWallRuns, getProfile, itemModel, itemTransform, mergedModel, panelBox, panelInstances, planBars, planFloor, quoteWorld, snapAlongWall, snapGap, updateItem, updateOpening, wallCoord, wallPoint, itemBox,
  runCommand, StaticCatalogProvider, wallBoxes, wallLength, wallRects, wallRectToBox, WALL_NAMES,
  type AABB, type DimLine, type PriceBook, type Room, type Selection, type StaticCatalog, type WallSide, type World, type WorldIssue, type WorldQuote,
} from "@handy/core";
import { openAssembly, type AssemblyHandle } from "./assembly-view.js";
import catalogJson from "@handy/core/data/catalog-ejemplo.json";

// ---------- Estado ----------

const providers = [new StaticCatalogProvider(catalogJson as StaticCatalog)];
const LS_KEY = "handy.world";
let world: World = createWorld("Mi casa");
let selection: Selection = { kind: "world" };
let apiAvailable = false;
let lastSaved = "";
const history: string[] = [];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const app = $("app"), view = $("view"), tree = $("tree"), props = $("props");
const SIDES: WallSide[] = ["north", "east", "south", "west"];
const LEFT_OF: Record<WallSide, WallSide> = { north: "west", east: "north", south: "east", west: "south" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (n: number) => n.toLocaleString("es-CO");
const money = (n: number, cur: string) => `${cur === "USD" ? "US$ " : "$ "}${n.toLocaleString("es-CO", { maximumFractionDigits: cur === "COP" ? 0 : 2 })}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---------- Persistencia: archivo local vía API, o el navegador ----------

async function loadWorld(): Promise<void> {
  try {
    const r = await fetch("/api/world", { cache: "no-store" });
    if (r.status === 200) { world = await r.json(); apiAvailable = true; lastSaved = JSON.stringify(world); return; }
    if (r.status === 204 && r.headers.get("x-handy-world") === "none") apiAvailable = true;
  } catch { /* sin servidor local: se usa el navegador */ }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw && !apiAvailable) { world = JSON.parse(raw); return; }
  } catch { /* almacenamiento no disponible */ }
  world = createWorld("Mi casa");
  runCommand(world, { kind: "world" }, "sala de 4 x 3 m");
  if (apiAvailable) await saveWorld();
}

// ---------- Precios propios: lo que tú o tu IA vieron en la tienda ----------

const PRICES_KEY = "handy.prices";
let book: PriceBook = createPriceBook();
let lastSavedBook = "";
const today = () => new Date().toISOString().slice(0, 10);

async function loadPrices(): Promise<void> {
  try {
    if (apiAvailable) {
      const r = await fetch("/api/prices", { cache: "no-store" });
      if (r.status === 200) { const b = await r.json(); if (isPriceBook(b)) { book = b; lastSavedBook = JSON.stringify(book); } }
      return;
    }
    const raw = localStorage.getItem(PRICES_KEY);
    if (raw) { const b = JSON.parse(raw); if (isPriceBook(b)) book = b; }
  } catch { /* sin precios propios todavía */ }
}

async function savePrices(): Promise<void> {
  book.updatedAt = new Date().toISOString();
  const body = JSON.stringify(book);
  lastSavedBook = body;
  try { localStorage.setItem(PRICES_KEY, body); } catch { /* sin almacenamiento */ }
  if (apiAvailable) {
    try { await fetch("/api/prices", { method: "PUT", headers: { "content-type": "application/json" }, body }); } catch { setSync("sin conexión con el archivo"); }
  }
}

const ownSaves: string[] = [];
async function saveWorld(): Promise<void> {
  world.updatedAt = new Date().toISOString();
  const body = JSON.stringify(world);
  lastSaved = body;
  // El archivo avisa de cada guardado, también de los propios: se recuerdan para no tomarlos por cambios de fuera.
  ownSaves.push(body);
  if (ownSaves.length > 30) ownSaves.shift();
  try { localStorage.setItem(LS_KEY, body); } catch { /* sin almacenamiento */ }
  if (apiAvailable) {
    try { await fetch("/api/world", { method: "PUT", headers: { "content-type": "application/json" }, body }); } catch { setSync("sin conexión con el archivo"); }
  }
}

function setSync(text: string) { $("sync").textContent = text; }

/** Lee JSON del servidor local. Si el archivo se está escribiendo en ese instante y llega a medias, reintenta una vez. */
async function fetchJson(url: string): Promise<unknown | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.status !== 200) return undefined;
      return JSON.parse(await r.text());
    } catch { await new Promise((ok) => setTimeout(ok, 300)); }
  }
  return undefined;
}

async function syncPrices() {
  const incoming = await fetchJson("/api/prices");
  if (!isPriceBook(incoming) || JSON.stringify(incoming) === lastSavedBook) return;
  book = incoming;
  lastSavedBook = JSON.stringify(book);
  void renderPrice();
  toast("Tu IA actualizó los precios.");
}

async function syncWorld() {
  const incoming = (await fetchJson("/api/world")) as World | undefined;
  if (!incoming || !Array.isArray(incoming.rooms) || !Array.isArray(incoming.items)) return;
  // Con dos órdenes seguidas puede llegar el eco de la primera cuando ya se guardó la segunda: no es un cambio externo.
  const echo = JSON.stringify(incoming);
  if (echo === lastSaved || ownSaves.includes(echo)) return;
  history.push(JSON.stringify(world));
  world = incoming;
  lastSaved = JSON.stringify(world);
  if (!selectionExists(selection)) selection = { kind: "world" };
  refresh();
  toast("Tu IA cambió el mundo.");
}

function listenForExternalChanges() {
  if (!apiAvailable) { setSync("guardado en este navegador"); return; }
  setSync("archivo local · en vivo");
  const es = new EventSource("/api/events");
  es.onmessage = (e) => {
    if (e.data === "prices") void syncPrices();
    else if (e.data === "changed") void syncWorld();
    // El servidor saluda en cada conexión. Si la conexión se cayó y volvió, pudo perderse un aviso: se compara todo de nuevo.
    else if (e.data === "hello") { void syncWorld(); void syncPrices(); }
  };
}

// ---------- Escena ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
view.prepend(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute("aria-label", "Vista 3D del mundo. Haz clic en un muro, mueble o abertura para seleccionarlo.");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(5, 10, 8);
scene.add(sun);
const content = new THREE.Group();
scene.add(content);

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitEdges = new THREE.EdgesGeometry(unitBox);
const COLORS = { wall: 0xcfd3d6, floor: 0x8f9396, ceramic: 0xd9cdb8, porcelain: 0xbfc3c4, board: 0xece9e2, back: 0xdedad2, door: 0xb98a5a, window: 0x7fc4d9, opening: 0x9a6b3f, metal: 0xa7adb3, steel: 0x3d4247, accent: 0xe8933a, outlet: 0xf2f2ee, switch: 0xf4c98b, data: 0x5cc3ca, light: 0xffd766, band: 0xe5534b, water: 0x4a90e2, drain: 0x5b6168, gas: 0xf2c200 };
const M = 0.001;
type Pick = THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
let pickables: Pick[] = [];

function box(b: AABB, color: number, data: Record<string, unknown>, opts: { opacity?: number; edges?: boolean } = {}): Pick {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, transparent: opts.opacity !== undefined, opacity: opts.opacity ?? 1 });
  const mesh = new THREE.Mesh(unitBox, mat);
  mesh.position.set(((b.min[0] + b.max[0]) / 2) * M, ((b.min[1] + b.max[1]) / 2) * M, ((b.min[2] + b.max[2]) / 2) * M);
  mesh.scale.set(Math.max(b.max[0] - b.min[0], 1) * M, Math.max(b.max[1] - b.min[1], 1) * M, Math.max(b.max[2] - b.min[2], 1) * M);
  mesh.userData = { ...data, baseColor: color, baseOpacity: opts.opacity ?? 1 };
  if (opts.edges !== false) mesh.add(new THREE.LineSegments(unitEdges, new THREE.LineBasicMaterial({ color: 0x1b1f23, transparent: true, opacity: 0.55 })));
  return mesh;
}

/** Tablero horizontal con esquinas redondeadas: las dos del frente (z mayor) o las cuatro. */
function roundedSlab(b: AABB, radius: number, all: boolean, color: number, data: Record<string, unknown>): Pick {
  const x0 = b.min[0] * M, x1 = b.max[0] * M, z0 = b.min[2] * M, z1 = b.max[2] * M, r = radius * M, rb = all ? r : 0;
  // El contorno se dibuja visto desde arriba (x, z) y luego se acuesta: girar un cuarto de vuelta lleva la z del dibujo al fondo del mueble.
  const s = new THREE.Shape();
  s.moveTo(x0 + rb, z0);
  s.lineTo(x1 - rb, z0);
  if (rb) s.absarc(x1 - rb, z0 + rb, rb, -Math.PI / 2, 0, false);
  s.lineTo(x1, z1 - r);
  s.absarc(x1 - r, z1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, z1);
  s.absarc(x0 + r, z1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, z0 + rb);
  if (rb) s.absarc(x0 + rb, z0 + rb, rb, Math.PI, 1.5 * Math.PI, false);
  const geo = new THREE.ExtrudeGeometry(s, { depth: (b.max[1] - b.min[1]) * M, bevelEnabled: false, curveSegments: 12 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, b.max[1] * M, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85 })) as unknown as Pick;
  mesh.userData = { ...data, baseColor: color, baseOpacity: 1, rounded: radius };
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x1b1f23, transparent: true, opacity: 0.55 })));
  return mesh;
}

function buildScene() {
  for (const child of [...content.children]) content.remove(child);
  pickables = [];
  for (const room of world.rooms) {
    const [ox, oz] = room.origin;
    const t = room.wallThickness;
    const floor = box({ min: [ox - t.west, -60, oz - t.north], max: [ox + room.width + t.east, 0, oz + room.depth + t.south] }, COLORS.floor, { sel: { kind: "room", roomId: room.id } });
    content.add(floor); pickables.push(floor);
    if (room.floor) {
      floor.userData.baseColor = room.floor.material === "porcelain" ? COLORS.porcelain : COLORS.ceramic;
      // Juntas: una línea por cada borde de baldosa, apenas sobre el piso.
      const pts: number[] = [];
      for (const t of planFloor(room, room.floor).tiles) {
        const x0 = (ox + t.x) * M, x1 = (ox + t.x + t.w) * M, z0 = (oz + t.z) * M, z1 = (oz + t.z + t.d) * M, y = 0.002;
        pts.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const joints = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x5b5f63 }));
      joints.userData.floorJoints = room.id;
      content.add(joints);
    }

    for (const wall of SIDES) {
      // Un muro compartido lo dibuja su dueña; de este lado no tiene grosor.
      if (room.wallThickness[wall] <= 0) continue;
      const shared = !!adjacentWall(world, room, wall);
      const openings = effectiveOpenings(world, room, wall);
      for (const r of wallRects(room, wall, openings)) {
        // Los muros compartidos no se atenúan: son la pared del fondo de la habitación vecina.
        const m = box(wallRectToBox(room, wall, r), COLORS.wall, { sel: { kind: "wall", roomId: room.id, wall }, ...(shared ? {} : { ghostSides: [wall] }), roomId: room.id });
        content.add(m); pickables.push(m);
      }
      for (const o of openings) {
        const full = wallRectToBox(room, wall, { u0: o.offset, u1: o.offset + o.width, y0: o.sill, y1: o.sill + o.height });
        // Hoja delgada en el centro del muro: hace visible y seleccionable la abertura.
        const axis = wall === "north" || wall === "south" ? 2 : 0;
        const mid = (full.min[axis] + full.max[axis]) / 2;
        const leaf: AABB = { min: [...full.min] as AABB["min"], max: [...full.max] as AABB["max"] };
        leaf.min[axis] = mid - 15; leaf.max[axis] = mid + 15;
        const m = box(leaf, o.type === "window" ? COLORS.window : COLORS.opening, { sel: { kind: "opening", roomId: o.ownerRoomId, openingId: o.id }, ...(shared ? {} : { ghostSides: [wall] }), roomId: room.id }, { opacity: o.type === "window" ? 0.45 : o.type === "door" ? 0.75 : 0.2 });
        content.add(m); pickables.push(m);
      }
    }
    const corners: [WallSide, WallSide, number, number, number, number][] = [
      ["north", "west", ox - t.west, ox, oz - t.north, oz], ["north", "east", ox + room.width, ox + room.width + t.east, oz - t.north, oz],
      ["south", "west", ox - t.west, ox, oz + room.depth, oz + room.depth + t.south], ["south", "east", ox + room.width, ox + room.width + t.east, oz + room.depth, oz + room.depth + t.south],
    ];
    for (const [a, b, x0, x1, z0, z1] of corners) if (x1 > x0 && z1 > z0) content.add(box({ min: [x0, 0, z0], max: [x1, room.height, z1] }, COLORS.wall, { ghostSides: [a, b], roomId: room.id }));

    // Columnas, buitrones y esquinas cerradas: macizos del color del muro, que se pueden seleccionar.
    for (const b of room.blocks ?? []) {
      // Si toca un muro que mira a la cámara, se vuelve transparente con él para no tapar el interior.
      const touches = SIDES.filter((w) => (w === "north" ? b.z <= 0 : w === "south" ? b.z + b.depth >= room.depth : w === "west" ? b.x <= 0 : b.x + b.width >= room.width));
      const m = box(blockBox(room, b), COLORS.wall, { sel: { kind: "block", roomId: room.id, blockId: b.id }, ...(touches.length ? { ghostSides: touches, roomId: room.id } : {}) });
      content.add(m); pickables.push(m);
    }

    // Puntos eléctricos: una placa sobre el muro, o un disco en el techo para las luces.
    for (const pt of room.points ?? []) {
      const [x, y, z] = pointPosition(room, pt);
      const sel: Selection = { kind: "point", roomId: room.id, pointId: pt.id };
      let b: AABB;
      if (pt.kind === "light") b = { min: [x - 90, y - 40, z - 90], max: [x + 90, y, z + 90] };
      else {
        const alongX = pt.wall === "north" || pt.wall === "south", into = pt.wall === "north" || pt.wall === "west" ? 1 : -1;
        b = alongX ? { min: [x - 45, y - 60, Math.min(z, z + into * 14)], max: [x + 45, y + 60, Math.max(z, z + into * 14)] } : { min: [Math.min(x, x + into * 14), y - 60, z - 45], max: [Math.max(x, x + into * 14), y + 60, z + 45] };
      }
      const m = box(b, COLORS[pt.kind], { sel });
      m.material.emissive.setHex(pt.kind === "light" ? 0x4a3a00 : 0x000000);
      content.add(m); pickables.push(m);
      // La placa mide 9 cm: una zona invisible de 30 cm alrededor la deja acertar con el mouse.
      const hit = box({ min: [b.min[0] - 110, b.min[1] - 90, b.min[2] - 110], max: [b.max[0] + 110, b.max[1] + 90, b.max[2] + 110] }, COLORS[pt.kind], { sel, grab: true }, { opacity: 0, edges: false });
      hit.material.depthWrite = false;
      content.add(hit); pickables.push(hit);
    }

    for (const item of world.items.filter((i) => i.roomId === room.id)) {
      const tr = itemTransform(room, item);
      const group = new THREE.Group();
      group.position.set(tr.position[0] * M, tr.position[1] * M, tr.position[2] * M);
      group.rotation.y = (tr.rotationY * Math.PI) / 180;
      const model = itemModel(item);
      for (const p of model.panels) {
        for (const u of panelInstances(p)) {
          const b = panelBox(p, u.placement);
          if (!b) continue;
          const color = p.id === "door" || p.id === "drawer-front" || p.id === "countertop" ? COLORS.door : p.id === "back" || p.id === "drawer-bottom" ? COLORS.back : COLORS.board;
          const m = p.cornerRadius ? roundedSlab(b, p.cornerRadius, p.roundedCorners === "all", color, { sel: { kind: "item", itemId: item.id } }) : box(b, color, { sel: { kind: "item", itemId: item.id } });
          group.add(m); pickables.push(m);
        }
      }
      for (const b of model.bars ?? []) for (const bx of b.boxes) {
        const m = box(bx, COLORS.steel, { sel: { kind: "item", itemId: item.id } });
        m.material.metalness = 0.5; m.material.roughness = 0.5;
        group.add(m); pickables.push(m);
      }
      if (model.bars?.length) {
        // Una estructura de tubo es casi toda hueca: un volumen invisible deja agarrarla por cualquier parte.
        const grab = box({ min: [0, 0, 0], max: [item.params.width, item.params.height, item.params.depth] }, COLORS.steel, { sel: { kind: "item", itemId: item.id }, grab: true }, { opacity: 0, edges: false });
        grab.material.depthWrite = false;
        group.add(grab); pickables.push(grab);
      }
      for (const f of model.fixtures ?? []) {
        const m = box(f.box, COLORS.metal, { sel: { kind: "item", itemId: item.id } });
        m.material.metalness = 0.6; m.material.roughness = 0.35;
        group.add(m); pickables.push(m);
      }
      content.add(group);
    }
  }
  applyHighlight();
  buildHandles();
  buildDims();
  buildBands();
  buildSun();
}

// ---------- Estudio de sol ----------

/** Fecha y hora que se están mirando, o nada si el sol está oculto. */
let sunView: { date: string; minutes: number } | null = null;
let sunMeshes: THREE.Mesh[] = [];
const SUN_HOME = new THREE.Vector3(5, 10, 8);

/** Pinta en el piso la mancha de sol de cada ventana a la hora elegida y pone la luz de la escena donde está el sol. */
function buildSun() {
  for (const m of sunMeshes) { content.remove(m); m.geometry.dispose(); }
  sunMeshes = [];
  const bar = $("sunbar"), toggle = $("sun-toggle");
  bar.hidden = !sunView;
  toggle.setAttribute("aria-pressed", String(!!sunView));
  if (!sunView || !world.site) { sun.position.copy(SUN_HOME); sun.intensity = 1.8; return; }
  const pos = sunPosition(world.site, sunView.date, sunView.minutes);
  const [, month, day] = sunView.date.split("-");
  const when = `${Number(day)} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(month) - 1]} · ${clock(sunView.minutes)}`;
  $("sun-label").textContent = `${world.site.place ?? "Sol"} · ${when}`;
  $<HTMLInputElement>("sun-time").value = String(sunView.minutes);
  for (const b of bar.querySelectorAll<HTMLButtonElement>("[data-sun-date]")) b.classList.toggle("on", b.dataset.sunDate !== "hoy" && sunView.date.endsWith(b.dataset.sunDate!));
  let entering = 0;
  if (pos.altitude > 0) {
    const v = sunVector(world.site, pos);
    sun.position.set(v[0] * 20, Math.max(v[1], 0.05) * 20, v[2] * 20);
    sun.intensity = 0.6 + 1.6 * Math.sin((pos.altitude * Math.PI) / 180);
    for (const room of world.rooms) for (const o of room.openings.filter((x) => x.type === "window")) {
      const patch = sunPatch(world, room, o, pos);
      if (!patch) continue;
      entering++;
      // Polígono convexo sobre el piso, en abanico desde su primer vértice.
      const vertices: number[] = [];
      for (let i = 1; i < patch.length - 1; i++) for (const q of [patch[0], patch[i + 1], patch[i]]) vertices.push(q[0] * M, 0.004, q[1] * M);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd966, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }));
      mesh.renderOrder = 3;
      content.add(mesh); sunMeshes.push(mesh);
    }
  } else { sun.position.copy(SUN_HOME); sun.intensity = 0.5; }
  $("sun-note").textContent = pos.altitude <= 0 ? "Es de noche a esa hora."
    : `Sol a ${Math.round(pos.altitude)}° de altura, viene del ${compassName(pos.azimuth)}. ${entering ? `Entra por ${entering} ventana(s): lo amarillo es donde toca el piso.` : "A esta hora no toca el piso por ninguna ventana."} No cuenta edificios vecinos, árboles ni aleros.`;
}

/** Muestra el sol a una hora y fecha; lo que no se diga se conserva o se toma de hoy a las 3 p. m. */
function showSun(change: { date?: string; minutes?: number } = {}): boolean {
  if (!world.site) { toast('Para ver el sol dime dónde está la casa: "estamos en Bogotá". Si el muro norte del modelo no mira al norte, dilo también: "el muro norte mira al este".', true); return false; }
  sunView = { date: change.date ?? sunView?.date ?? today(), minutes: change.minutes ?? sunView?.minutes ?? 900 };
  buildSun();
  return true;
}
function hideSun() { sunView = null; buildSun(); }
$("sun-toggle").onclick = () => { if (sunView) hideSun(); else showSun(); };
$("sun-close").onclick = hideSun;
$<HTMLInputElement>("sun-time").oninput = (e) => { showSun({ minutes: Number((e.target as HTMLInputElement).value) }); };
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-sun-date]")) b.onclick = () => { showSun({ date: b.dataset.sunDate === "hoy" ? today() : `${new Date().getFullYear()}-${b.dataset.sunDate}` }); };

/** Habitación a la que pertenece lo seleccionado. */
function selectedRoom(): Room | undefined {
  const s = selection;
  if (s.kind === "world") return undefined;
  const id = s.kind === "item" ? world.items.find((i) => i.id === s.itemId)?.roomId : s.roomId;
  return world.rooms.find((r) => r.id === id);
}

/**
 * Franjas rojas de piso a techo sobre cada toma e interruptor de la habitación seleccionada:
 * por ahí suele subir o bajar la tubería, y es donde no conviene perforar.
 */
let bands: THREE.Mesh[] = [];
function buildBands() {
  for (const b of bands) content.remove(b);
  bands = [];
  const room = selectedRoom();
  if (!room) return;
  for (const d of drillBands(room)) {
    const a = wallPoint(room, d.wall, d.from, 0, 4), c = wallPoint(room, d.wall, d.to, room.height, 8);
    const m = box({ min: [Math.min(a[0], c[0]), 0, Math.min(a[2], c[2])], max: [Math.max(a[0], c[0]), room.height, Math.max(a[2], c[2])] }, COLORS.band, { band: d.pointId }, { opacity: 0.2, edges: false });
    m.material.depthWrite = false;
    content.add(m); bands.push(m);
  }
}

const sameSel = (a: Selection | undefined, b: Selection) => !!a && JSON.stringify(a) === JSON.stringify(b);

/** La misma pared vista desde la habitación vecina, si la selección es un muro compartido. */
function sharedAlias(sel: Selection): Selection | null {
  if (sel.kind !== "wall") return null;
  const room = world.rooms.find((r) => r.id === sel.roomId);
  const adj = room && adjacentWall(world, room, sel.wall);
  return adj ? { kind: "wall", roomId: adj.room.id, wall: adj.wall } : null;
}

function applyHighlight() {
  const alias = sharedAlias(selection);
  for (const m of pickables) {
    const selected = sameSel(m.userData.sel as Selection | undefined, selection) || (!!alias && sameSel(m.userData.sel as Selection | undefined, alias));
    m.material.color.setHex(selected ? COLORS.accent : (m.userData.baseColor as number));
    m.material.emissive.setHex(selected ? 0x4a2a08 : 0x000000);
  }
}

/** Atenúa los muros que quedan entre la cámara y la habitación para poder ver y hacer clic adentro. */
function updateGhostWalls() {
  const facing = new Map<string, boolean>();
  for (const room of world.rooms) {
    const wb = wallBoxes(room);
    for (const side of SIDES) {
      const b = wb[side];
      const cx = ((b.min[0] + b.max[0]) / 2) * M, cz = ((b.min[2] + b.max[2]) / 2) * M;
      const n = side === "north" ? [0, -1] : side === "south" ? [0, 1] : side === "east" ? [1, 0] : [-1, 0];
      facing.set(`${room.id}:${side}`, (camera.position.x - cx) * n[0] + (camera.position.z - cz) * n[1] > 0.05);
    }
  }
  content.traverse((o) => {
    const sides = o.userData.ghostSides as WallSide[] | undefined;
    if (!sides) return;
    const mesh = o as Pick;
    const ghost = sides.some((s) => facing.get(`${o.userData.roomId}:${s}`));
    mesh.userData.ghost = ghost;
    mesh.material.transparent = ghost || (mesh.userData.baseOpacity as number) < 1;
    mesh.material.opacity = ghost ? 0.08 : (mesh.userData.baseOpacity as number);
    mesh.material.depthWrite = !ghost;
    (mesh.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> | undefined)?.material && ((mesh.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>).material.opacity = ghost ? 0.12 : 0.55);
  });
}

function frameWorld() {
  const b = new THREE.Box3().setFromObject(content);
  if (b.isEmpty()) { camera.position.set(4, 5, 6); controls.target.set(0, 0, 0); return; }
  const c = b.getCenter(new THREE.Vector3()), size = b.getSize(new THREE.Vector3());
  const d = Math.max(size.x, size.z) * 1.3 + 2;
  controls.target.set(c.x, 0.8, c.z);
  camera.position.set(c.x - d * 0.25, d * 0.95, c.z + d * 0.85);
}

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);

function themeBackground() {
  const bg = getComputedStyle(app).getPropertyValue("--bg").trim();
  scene.background = new THREE.Color(bg || "#1A1C1E");
}

renderer.setAnimationLoop(() => {
  controls.update();
  updateGhostWalls();
  renderer.render(scene, camera);
  placeDimLabels();
});

// ---------- Cotas: medidas de lo seleccionado, dibujadas sobre la vista ----------

const dimsLayer = document.createElement("div");
dimsLayer.id = "dims";
view.appendChild(dimsLayer);
const dimLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: COLORS.accent, depthTest: false, transparent: true }));
dimLines.renderOrder = 10;
scene.add(dimLines);
let dims: DimLine[] = [];

function buildDims() {
  dims = dimensionsFor(world, selection);
  const pts: number[] = [];
  for (const d of dims) pts.push(d.from[0] * M, d.from[1] * M, d.from[2] * M, d.to[0] * M, d.to[1] * M, d.to[2] * M);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  dimLines.geometry.dispose();
  dimLines.geometry = g;
  dimsLayer.innerHTML = dims.map((d) => `<span class="dim ${d.kind}">${fmt(d.value)}</span>`).join("");
}

const projected = new THREE.Vector3();
function placeDimLabels() {
  const w = view.clientWidth, h = view.clientHeight;
  dimsLayer.childNodes.forEach((n, i) => {
    const d = dims[i], el = n as HTMLElement;
    if (!d) return;
    projected.set(((d.from[0] + d.to[0]) / 2) * M, ((d.from[1] + d.to[1]) / 2) * M, ((d.from[2] + d.to[2]) / 2) * M).project(camera);
    const visible = projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05;
    el.style.display = visible ? "" : "none";
    el.style.transform = `translate(-50%, -50%) translate(${(((projected.x + 1) / 2) * w).toFixed(1)}px, ${(((1 - projected.y) / 2) * h).toFixed(1)}px)`;
  });
}

// ---------- Selección con clic y arrastre con el mouse ----------

/** Lo que se puede arrastrar a lo largo de su muro: un mueble o una abertura. */
function dragTarget(sel: Selection): { room: Room; wall: WallSide; offset: number; width: number; height: number; base: number; front: number } | null {
  if (sel.kind === "item") {
    const item = world.items.find((i) => i.id === sel.itemId);
    const room = item && world.rooms.find((r) => r.id === item.roomId);
    if (!item || !room) return null;
    const b = itemBox(room, item);
    const front = Math.max(wallCoord(room, item.wall, b.min[0], b.min[2]).inset, wallCoord(room, item.wall, b.max[0], b.max[2]).inset);
    return { room, wall: item.wall, offset: item.offset, width: item.params.width, height: item.params.height, base: item.elevation, front };
  }
  if (sel.kind === "opening") {
    const room = world.rooms.find((r) => r.id === sel.roomId);
    const o = room?.openings.find((x) => x.id === sel.openingId);
    if (!room || !o) return null;
    return { room, wall: o.wall, offset: o.offset, width: o.width, height: o.height, base: o.sill, front: 0 };
  }
  return null;
}

/** Cuadros naranjas del mueble seleccionado: uno en el borde derecho (ancho) y otro arriba (alto). */
let handles: Pick[] = [];
function buildHandles() {
  for (const h of handles) content.remove(h);
  handles = [];
  if (selection.kind !== "item") return;
  const t = dragTarget(selection);
  if (!t) return;
  const make = (kind: "width" | "height", u: number, y: number) => {
    const [x, yy, z] = wallPoint(t.room, t.wall, u, y, t.front + 25);
    const m = box({ min: [x - 40, yy - 40, z - 40], max: [x + 40, yy + 40, z + 40] }, COLORS.accent, { handle: kind });
    m.material.emissive.setHex(0x6a3a08);
    m.renderOrder = 5;
    content.add(m);
    handles.push(m);
  };
  make("width", t.offset + t.width, t.base + t.height / 2);
  make("height", t.offset + t.width / 2, t.base + t.height);
}

const raycaster = new THREE.Raycaster();
const pointerNdc = (e: { clientX: number; clientY: number }) => {
  const rect = renderer.domElement.getBoundingClientRect();
  return new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
};

interface Drag { mode: "move" | "width" | "height"; sel: Selection; snapshot: string; plane: THREE.Plane; u0: number; inset0: number; y0: number; startOffset: number; startGap: number; startValue: number; active: boolean; changed: boolean }
let down: { x: number; y: number } | null = null;
let drag: Drag | null = null;
let rebuildQueued = false;
function queueRebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => { rebuildQueued = false; buildScene(); renderProps(); });
}

// En captura, para decidir antes que la cámara si este gesto mueve un mueble o gira la vista.
renderer.domElement.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY };
  if (e.button !== 0) return;
  raycaster.setFromCamera(pointerNdc(e), camera);
  const onHandle = raycaster.intersectObjects(handles, false)[0];
  const hit = onHandle ?? raycaster.intersectObjects(pickables.filter((m) => !m.userData.ghost), false)[0];
  if (!hit) return;
  // Solo se arrastra lo que ya está seleccionado: el primer clic selecciona, el segundo gesto mueve.
  const sel = onHandle ? selection : (hit.object.userData.sel as Selection | undefined);
  if (!sel || !sameSel(sel, selection)) return;
  const t = dragTarget(sel);
  if (!t) return;
  const mode = (onHandle ? onHandle.object.userData.handle : "move") as Drag["mode"];
  const plane = new THREE.Plane();
  if (mode === "height") {
    const n = new THREE.Vector3(camera.position.x - hit.point.x, 0, camera.position.z - hit.point.z).normalize();
    plane.setFromNormalAndCoplanarPoint(n, hit.point);
  } else plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), hit.point);
  const at = wallCoord(t.room, t.wall, hit.point.x / M, hit.point.z / M);
  const dragged = sel.kind === "item" ? world.items.find((i) => i.id === sel.itemId) : undefined;
  drag = { mode, sel, snapshot: JSON.stringify(world), plane, u0: at.u, inset0: at.inset, y0: hit.point.y / M, startOffset: t.offset, startGap: dragged?.gap ?? 0, startValue: mode === "width" ? t.width : t.height, active: false, changed: false };
  controls.enabled = false;
}, { capture: true });

window.addEventListener("pointermove", (e) => {
  if (!drag || !down) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) return;
    drag.active = true;
    renderer.domElement.style.cursor = "grabbing";
  }
  raycaster.setFromCamera(pointerNdc(e), camera);
  const p = raycaster.ray.intersectPlane(drag.plane, new THREE.Vector3());
  const t = dragTarget(drag.sel);
  if (!p || !t) return;
  const round = (v: number) => Math.round(v / 10) * 10;
  try {
    if (drag.mode === "move") {
      const raw = drag.startOffset + (wallCoord(t.room, t.wall, p.x / M, p.z / M).u - drag.u0);
      const exclude = drag.sel.kind === "item" ? { itemId: drag.sel.itemId } : drag.sel.kind === "opening" ? { openingId: drag.sel.openingId } : {};
      const offset = snapAlongWall(world, t.room.id, t.wall, t.width, raw, exclude);
      if (drag.sel.kind === "item") {
        // Hacia adentro del cuarto el mueble se despega del muro. Uno pegado necesita un tirón claro (20 cm)
        // para soltarse, y uno colgado no se suelta: así mover de lado no lo despega sin querer.
        const item = world.items.find((i) => i.id === (drag!.sel as { itemId: string }).itemId)!;
        const rawGap = drag.startGap + (wallCoord(t.room, t.wall, p.x / M, p.z / M).inset - drag.inset0);
        const gap = item.elevation > 0 || (drag.startGap === 0 && rawGap < 200) ? drag.startGap : snapGap(world, item.id, rawGap);
        if (offset === t.offset && gap === (item.gap ?? 0)) return;
        try { updateItem(world, item.id, { offset, gap }); } catch { updateItem(world, item.id, { offset }); }
      } else if (offset === t.offset) return;
      else if (drag.sel.kind === "opening") updateOpening(world, drag.sel.roomId, drag.sel.openingId, { offset });
    } else if (drag.sel.kind === "item" && drag.mode === "width") {
      const width = round(drag.startValue + (wallCoord(t.room, t.wall, p.x / M, p.z / M).u - drag.u0));
      if (width === t.width || width < 150) return;
      updateItem(world, drag.sel.itemId, { params: { width } });
    } else if (drag.sel.kind === "item" && drag.mode === "height") {
      const height = round(drag.startValue + (p.y / M - drag.y0));
      if (height === t.height || height < 100) return;
      updateItem(world, drag.sel.itemId, { params: { height } });
    } else return;
    drag.changed = true;
    queueRebuild();
  } catch { /* esa medida no cabe o no se puede construir: se conserva la última válida */ }
});

window.addEventListener("pointerup", async (e) => {
  const d = drag, start = down;
  drag = null; down = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = "";
  if (d?.active) {
    if (d.changed) {
      history.push(d.snapshot);
      await saveWorld();
      refresh();
      const t = dragTarget(d.sel);
      if (t) toast(d.mode === "move" ? `${selectionLabel(d.sel)}: de ${fmt(t.offset)} a ${fmt(t.offset + t.width)} mm en el ${WALL_NAMES[t.wall]}.` : `${selectionLabel(d.sel)}: ${d.mode === "width" ? "ancho" : "alto"} ${fmt(d.mode === "width" ? t.width : t.height)} mm.`);
    }
    return;
  }
  if (e.target !== renderer.domElement || !start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
  raycaster.setFromCamera(pointerNdc(e), camera);
  if (raycaster.intersectObjects(handles, false)[0]) return;
  const hit = raycaster.intersectObjects(pickables.filter((m) => !m.userData.ghost), false)[0];
  let picked = (hit?.object.userData.sel as Selection | undefined) ?? { kind: "world" as const };
  if (picked.kind === "wall") {
    // Un muro compartido se toma del lado desde el que se está mirando, para que izquierda y derecha coincidan con lo que se ve.
    const wallSel = picked;
    const room = world.rooms.find((r) => r.id === wallSel.roomId);
    const adj = room && adjacentWall(world, room, wallSel.wall);
    if (room && adj && wallCoord(room, wallSel.wall, camera.position.x / M, camera.position.z / M).inset < 0) picked = { kind: "wall", roomId: adj.room.id, wall: adj.wall };
  }
  select(picked);
  $<HTMLInputElement>("cmd-input").focus();
});

/** Cancela un arrastre en curso y deja todo como estaba. */
function cancelDrag() {
  if (!drag) return;
  world = JSON.parse(drag.snapshot);
  drag = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = "";
  refresh();
}

function selectionExists(s: Selection): boolean {
  switch (s.kind) {
    case "world": return true;
    case "room": return world.rooms.some((r) => r.id === s.roomId);
    case "wall": return world.rooms.some((r) => r.id === s.roomId);
    case "opening": return world.rooms.some((r) => r.id === s.roomId && r.openings.some((o) => o.id === s.openingId));
    case "item": return world.items.some((i) => i.id === s.itemId);
    case "block": return world.rooms.some((r) => r.id === s.roomId && !!r.blocks?.some((b) => b.id === s.blockId));
    case "point": return world.rooms.some((r) => r.id === s.roomId && !!r.points?.some((p) => p.id === s.pointId));
  }
}

function selectionLabel(s: Selection): string {
  switch (s.kind) {
    case "world": return "Mundo";
    case "room": return world.rooms.find((r) => r.id === s.roomId)?.name ?? "Habitación";
    case "wall": return `${world.rooms.find((r) => r.id === s.roomId)?.name} · ${WALL_NAMES[s.wall]}`;
    case "opening": {
      const room = world.rooms.find((r) => r.id === s.roomId);
      const o = room?.openings.find((x) => x.id === s.openingId);
      return `${room?.name} · ${o?.type === "window" ? "ventana" : o?.type === "door" ? "puerta" : "paso"} del ${o ? WALL_NAMES[o.wall] : ""}`;
    }
    case "item": return world.items.find((i) => i.id === s.itemId)?.name ?? "Mueble";
    case "block": { const room = world.rooms.find((r) => r.id === s.roomId); return `${room?.name} · ${room?.blocks?.find((b) => b.id === s.blockId)?.name ?? "columna"}`; }
    case "point": { const room = world.rooms.find((r) => r.id === s.roomId); return `${room?.name} · ${room?.points?.find((p) => p.id === s.pointId)?.name ?? "punto"}`; }
  }
}

function select(s: Selection) {
  selection = s;
  applyHighlight();
  buildHandles();
  buildDims();
  buildBands();
  renderTree();
  renderProps();
  $("sel-chip").textContent = s.kind === "world" ? "Nada seleccionado" : selectionLabel(s);
  $("cmd-prefix").textContent = `${selectionLabel(s)} ›`;
  $<HTMLInputElement>("cmd-input").placeholder = PLACEHOLDER[s.kind];
}

const PLACEHOLDER: Record<Selection["kind"], string> = {
  world: 'Haz clic en un muro o un mueble, o crea una habitación: "cocina de 2,8 x 2,4 m"',
  room: '"mesa de tubo de 120 x 75 x 60" · "piso de porcelanato 60 x 60" · "alto 2,6 m"',
  wall: '"pon una puerta de 80 x 205 a 2 m de la izquierda" · "armario de 800 x 2000 x 500 con 2 puertas"',
  opening: '"muévela 20 cm a la derecha" · "90 x 210" · "quítala"',
  point: '"muévela 20 cm a la derecha" · "a 1,1 m del piso" · "quítala"',
  block: '"muévela 20 cm al este" · "a 1 m del muro norte" · "40 x 60" · "quítala"',
  item: '"ensancha 10 cm" · "agrega una repisa" · "muévelo 30 cm a la derecha" · "¿cómo se arma?"',
};

const EXAMPLES: Record<Selection["kind"], string[]> = {
  world: ["estamos en Bogotá", "el muro norte mira al este", "sol a las 3 pm", "sol el 21 de junio a las 9", "cocina de 2,8 x 2,4 m", "baño de 1,5 x 2,2 al este de la cocina", "estudio de 3 x 3 al sur de la sala desplazado 50 cm"],
  point: ["muévela 20 cm a la derecha", "a 1 m de la izquierda", "a 1,1 m del piso", "súbela 10 cm", "con protección", "quítala"],
  block: ["muévela 20 cm al este", "muévela 50 cm al sur", "a 1 m del muro norte", "céntrala", "40 x 60", "alto 1 m", "hasta el techo", "quítala"],
  room: ["mesa de tubo de 120 x 75 x 60", "isla de 180 x 90 x 60 con 4 cajones", "columna de 30 x 30 a 2 m del muro oeste y 1 m del muro norte", "recorta la esquina noreste 2 x 1,5 m", "buitrón de 60 x 40 en la esquina suroeste", "2 luces", "reparte las tomas", "piso de porcelanato 60 x 60", "piso de cerámica 45 x 45 trabado", "junta 3", "quita el piso", "alto 2,6 m", "ancho 4 m"],
  wall: ["cocina", "cocina de 2,4 m sin altos", "toma a 1 m de la izquierda", "interruptor", "toma de mesón a 60 cm de la derecha", "punto de lavaplatos a 1 m de la izquierda", "punto de lavadora", "punto de gas a 50 cm de la derecha", "pon una puerta de 80 x 205 a 2 m de la izquierda", "ventana de 120 x 100 centrada, antepecho 110", "armario de 800 x 2000 x 500 a 60 cm de la derecha con 2 puertas y 3 repisas", "closet de 180 x 220 x 60 con 2 divisiones, barra y 3 cajones", "cajonera de 80 x 90 x 50", "mesa de tubo de 120 x 75 x 60", "estantería metálica de 100 x 200 x 40 con 5 niveles", "alacena de 900 x 700 x 350 a 1,5 m del piso con 2 puertas", "grosor 20 cm"],
  opening: ["muévela 20 cm a la derecha", "a 1 m de la izquierda", "90 x 210", "céntrala", "quítala"],
  item: ["ponle cubierta", "esquinas redondeadas", "radio 8 cm", "ensancha 10 cm", "alto 1800", "muévelo 30 cm a la derecha", "sepáralo 60 cm", "en el centro del cuarto", "gíralo", "pásalo al muro sur", "agrega una repisa", "2 divisiones", "3 cajones", "con barra de colgar", "2 puertas", "sin tornillos a la vista", "quítalo"],
};

const FRAME_EXAMPLES = ["esquinas redondeadas", "radio 8 cm", "esquinas rectas", "tubo de 50", "tubo de 25", "5 niveles", "sin tablero", "atornillada", "ensancha 20 cm", "alto 90 cm", "muévelo 30 cm a la derecha", "en el centro del cuarto", "gíralo", "pégalo al muro", "quítalo"];

// ---------- Paneles ----------

/** Horas de sol directo de cada ventana de una habitación en las tres fechas de referencia. */
function sunRows(r: Room): string {
  const windows = r.openings.filter((o) => o.type === "window");
  if (!windows.length) return "";
  if (!world.site) return `<p class="note">Para saber cuánto sol recibe cada ventana, dime dónde está la casa: "estamos en Bogotá".</p>`;
  const days = REFERENCE_DAYS(new Date().getFullYear()).map((d) => sunReport(world, d.date, r.id));
  const h = (n: number) => `${String(n).replace(".", ",")} h`;
  return windows.map((o, i) => kv(`Sol · ventana ${compassName(wallBearing(world.site!, o.wall))}`, `jun ${h(days[0][i].hours)} · mar ${h(days[1][i].hours)} · dic ${h(days[2][i].hours)}`)).join("");
}

function node(label: string, meta: string, level: number, sel: Selection): string {
  return `<button type="button" class="node l${level}" data-sel='${esc(JSON.stringify(sel))}' aria-current="${sameSel(sel, selection)}"><span>${esc(label)}</span><span class="num">${esc(meta)}</span></button>`;
}

function renderTree() {
  let html = "";
  for (const room of world.rooms) {
    html += node(room.name, `${fmt(room.width)} × ${fmt(room.depth)}`, 0, { kind: "room", roomId: room.id });
    for (const p of (room.points ?? []).filter((x) => x.kind === "light")) html += node(p.name, "techo", 1, { kind: "point", roomId: room.id, pointId: p.id });
    for (const b of room.blocks ?? []) html += node(b.name, `${fmt(b.width)} × ${fmt(b.depth)}`, 1, { kind: "block", roomId: room.id, blockId: b.id });
    // Los muebles sueltos van aparte: no pertenecen a un muro.
    for (const i of world.items.filter((x) => x.roomId === room.id && x.gap)) html += node(`${i.name} · suelto`, `${fmt(i.params.width)} × ${fmt(i.params.height)}`, 1, { kind: "item", itemId: i.id });
    for (const wall of SIDES) {
      const adj = adjacentWall(world, room, wall);
      html += node(cap(WALL_NAMES[wall]) + (adj ? ` · con ${adj.room.name}` : ""), fmt(wallLength(room, wall)), 1, { kind: "wall", roomId: room.id, wall });
      for (const o of room.openings.filter((x) => x.wall === wall)) html += node(o.type === "window" ? "Ventana" : o.type === "door" ? "Puerta" : "Paso", `${fmt(o.width)} × ${fmt(o.height)}`, 2, { kind: "opening", roomId: room.id, openingId: o.id });
      for (const p of (room.points ?? []).filter((x) => x.wall === wall)) html += node(p.name, `a ${fmt(p.height ?? 0)}`, 2, { kind: "point", roomId: room.id, pointId: p.id });
      for (const i of world.items.filter((x) => x.roomId === room.id && x.wall === wall && !x.gap)) html += node(i.name, `${fmt(i.params.width)} × ${fmt(i.params.height)}`, 2, { kind: "item", itemId: i.id });
    }
  }
  tree.innerHTML = html || `<p class="note">Aún no hay habitaciones. Escribe abajo: "sala de 4 x 3 m".</p>`;
}
tree.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>(".node");
  if (b?.dataset.sel) select(JSON.parse(b.dataset.sel));
});

const kv = (k: string, v: string) => `<div class="kv"><span class="k">${esc(k)}</span><span class="num">${esc(v)}</span></div>`;
let issues: WorldIssue[] = [];

function renderProps() {
  const s = selection;
  let body = "";
  if (s.kind === "world") {
    body = kv("Habitaciones", String(world.rooms.length)) + kv("Muebles", String(world.items.length)) + `<p class="note">Haz clic en un muro, un mueble, una puerta o una ventana y escribe abajo lo que quieres cambiar, en tus palabras.</p>`;
  } else if (s.kind === "room") {
    const r = world.rooms.find((x) => x.id === s.roomId)!;
    body = kv("Ancho (norte y sur)", `${fmt(r.width)} mm`) + kv("Fondo (este y oeste)", `${fmt(r.depth)} mm`) + kv("Altura", `${fmt(r.height)} mm`) + kv(r.blocks?.length ? "Piso libre" : "Área", `${(roomArea(r) / 1e6).toFixed(1).replace(".", ",")} m²`) + (r.blocks?.length ? kv("Columnas y recortes", String(r.blocks.length)) : "") + sunRows(r);
    if (r.floor) {
      const f = r.floor, plan = planFloor(r, f);
      body += `<div class="kv"><span class="k"><strong>Piso</strong></span><span class="num">${f.material === "porcelain" ? "porcelanato" : "cerámica"} ${fmt(f.tileWidth)} × ${fmt(f.tileLength)}</span></div>` +
        kv("Colocación", `${f.pattern === "brick" ? "trabado" : "recto"} · junta ${f.joint} mm · ${f.start === "center" ? "centrado" : "desde la esquina"}`) +
        kv("Piezas", `${plan.fullTiles} enteras + ${plan.cutTiles} cortes`) +
        kv("Comprar", `${plan.tilesToBuy} piezas (reserva ${plan.reservePct} %)`) +
        kv("Cajas", boxesFor(r.name, plan.tilesToBuy) ?? `aprox. ${plan.boxes} si traen ${plan.piecesPerBox}`) +
        kv("Pega", `${plan.adhesive.bags25} saco(s) de 25 kg · ${plan.adhesive.type}`) +
        kv("Boquilla", `${String(plan.grout.kg).replace(".", ",")} kg · ${plan.grout.bags2} bolsa(s) de 2 kg`) +
        kv("Guardaescobas", `${String(plan.skirtingM).replace(".", ",")} m`) +
        kv("Llana", plan.adhesive.trowel) +
        plan.notes.map((n) => `<p class="note">${esc(n)}</p>`).join("");
    }
  } else if (s.kind === "wall") {
    const r = world.rooms.find((x) => x.id === s.roomId)!;
    const runs = freeWallRuns(world, r.id, { height: 900, minLength: 200 }).filter((x) => x.wall === s.wall);
    const adj = adjacentWall(world, r, s.wall);
    const thickness = r.wallThickness[s.wall] > 0 || !adj ? `${fmt(r.wallThickness[s.wall])} mm` : `${fmt(adj.room.wallThickness[adj.wall])} mm · es de ${adj.room.name}`;
    body = kv("Largo", `${fmt(wallLength(r, s.wall))} mm`) + kv("Grosor", thickness) + (adj ? kv("Compartido con", adj.room.name) : "") + kv("Altura", `${fmt(r.height)} mm`) + kv("Izquierda", `esquina con el ${WALL_NAMES[LEFT_OF[s.wall]]}`) +
      kv("Tramos libres", runs.map((x) => `${fmt(x.from)}–${fmt(x.to)}`).join(" · ") || "ninguno") + `<p class="note">Las distancias se miden desde la izquierda mirando el muro desde dentro de la habitación.</p>`;
  } else if (s.kind === "point") {
    const r = world.rooms.find((x) => x.id === s.roomId)!;
    const p = r.points!.find((x) => x.id === s.pointId)!;
    const t = electricalTakeoff(r);
    body = (p.kind === "light"
      ? kv("Dónde", "en el techo") + kv("Del muro oeste", `${fmt(p.x ?? 0)} mm`) + kv("Del muro norte", `${fmt(p.z ?? 0)} mm`)
      : kv("Tipo", p.kind === "water" ? "agua" : p.kind === "drain" ? "desagüe" : p.kind === "gas" ? "gas" : p.kind === "switch" ? "interruptor" : p.kind === "data" ? "datos" : "toma") + kv("Muro", WALL_NAMES[p.wall!]) + kv("Desde la izquierda", `${fmt(p.offset ?? 0)} mm`) + kv("Del piso", `${fmt(p.height ?? 0)} mm`) + (p.kind === "outlet" ? kv("Protección GFCI", p.gfci ? "sí" : "no") : "")) +
      (p.kind === "water" || p.kind === "drain" || p.kind === "gas" ? "" : kv("Puntos eléctricos en la habitación", String(t.boxes)) + kv("Tubería estimada", `${String(t.conduitM).replace(".", ",")} m`) + kv("Cable estimado", `${String(t.wireM).replace(".", ",")} m`)) +
      `<p class="note">${p.kind === "light" ? "Flechas: la mueven 10 mm hacia el oeste, el este, el norte o el sur." : "La franja roja marca por dónde suele subir o bajar la tubería: no perfores ahí sin comprobar. Flechas: 10 mm, con Mayús 100."} Alturas habituales, no una revisión de norma: la instalación la valida quien la hace.</p>`;
  } else if (s.kind === "block") {
    const r = world.rooms.find((x) => x.id === s.roomId)!;
    const b = r.blocks!.find((x) => x.id === s.blockId)!;
    body = kv("Ancho × fondo", `${fmt(b.width)} × ${fmt(b.depth)} mm`) + kv("Alto", b.height ? `${fmt(b.height)} mm` : "hasta el techo") + kv("Del muro oeste", `${fmt(b.x)} mm`) + kv("Del muro norte", `${fmt(b.z)} mm`) +
      kv("Al muro este", `${fmt(r.width - b.x - b.width)} mm`) + kv("Al muro sur", `${fmt(r.depth - b.z - b.depth)} mm`) + `<p class="note">Flechas: la mueven 10 mm hacia el oeste, el este, el norte o el sur; con Mayús, 100.</p>`;
  } else if (s.kind === "opening") {
    const r = world.rooms.find((x) => x.id === s.roomId)!;
    const o = r.openings.find((x) => x.id === s.openingId)!;
    body = kv("Ancho × alto", `${fmt(o.width)} × ${fmt(o.height)} mm`) + kv("Desde la izquierda", `${fmt(o.offset)} mm`) + kv("Hasta la derecha", `${fmt(wallLength(r, o.wall) - o.offset - o.width)} mm`) + (o.type === "window" ? kv("Antepecho", `${fmt(o.sill)} mm`) : "");
  } else {
    const i = world.items.find((x) => x.id === s.itemId)!;
    const p = i.params;
    if (i.kind === "frame") {
      const m = itemModel(i), meta = m.meta as { profile: string; steelKg: number; steelMeters: number; joint: string; joints: number };
      const bars = planBars(m.bars ?? []).totals[0];
      body = kv("Ancho × alto × fondo", `${fmt(p.width)} × ${fmt(p.height)} × ${fmt(p.depth)}`) + kv("Tipo", i.frame?.type === "shelving" ? `estantería · ${i.frame.levels ?? 4} niveles` : "mesa") + kv("Perfil", getProfile(meta.profile).name.replace("Tubo cuadrado ", "tubo ")) +
        kv("Acero", `${String(meta.steelMeters).replace(".", ",")} m · ${String(meta.steelKg).replace(".", ",")} kg`) + kv("Barras de 6 m", bars ? `${bars.bars} · sobra ${bars.wastePct} %` : "—") +
        kv("Uniones", `${meta.joints} · ${meta.joint === "weld" ? "soldadas" : "atornilladas"}`) + kv("Tablero", i.frame?.top === false ? "no" : "sí") + kv("Muro", WALL_NAMES[i.wall]) + kv("Desde la izquierda", `${fmt(i.offset)} mm`) + kv("Separado del muro", i.gap ? `${fmt(i.gap)} mm` : "pegado");
    } else body = kv("Ancho × alto × fondo", `${fmt(p.width)} × ${fmt(p.height)} × ${fmt(p.depth)}`) + kv("Muro", WALL_NAMES[i.wall]) + kv("Desde la izquierda", `${fmt(i.offset)} mm`) + kv("Separado del muro", i.gap ? `${fmt(i.gap)} mm` : "pegado") + kv("Del piso", `${fmt(i.elevation)} mm`) +
      kv("Puertas", String(p.doors ?? 0)) + kv("Repisas", String(p.shelves ?? 0)) + (p.dividers ? kv("Divisiones", `${p.dividers} · ${p.dividers + 1} cuerpos`) : "") + (p.drawers ? kv("Cajones", `${p.drawers} de ${fmt(p.drawerHeight ?? 200)} mm`) : "") + (p.hangingBar ? kv("Barra de colgar", "sí, con maletero") : "") + kv("Zócalo", p.plinthHeight ? `${fmt(p.plinthHeight)} mm` : "no") + kv("Unión", p.joinery === "minifix" || p.joinery === "dowel" ? `${p.joinery} · sin tornillos a la vista` : p.joinery ?? "confirmat");
  }
  if (s.kind === "item") body += `<p class="note">Arrastra para moverlo: de lado va por su muro y hacia adentro se despega de él. Los cuadros naranjas cambian ancho y alto. Flechas: 10 mm, con Mayús 100. R lo gira.</p>`;
  else if (s.kind === "opening") body += `<p class="note">Arrastra para moverla a lo largo del muro. Flechas: 10 mm, con Mayús 100.</p>`;
  const mine = issues.filter((x) => (s.kind === "item" && x.itemId === s.itemId) || s.kind === "world" || ((s.kind === "room" || s.kind === "wall") && x.roomId === s.roomId));
  props.innerHTML =
    `<div class="sec"><h2>${esc(s.kind === "world" ? world.name : selectionLabel(s))}</h2><div class="b">${body}</div></div>` +
    `<div class="sec"><h2>Puedes decir</h2><div class="b">${(s.kind === "item" && world.items.find((x) => x.id === s.itemId)?.kind === "frame" ? FRAME_EXAMPLES : EXAMPLES[s.kind]).map((x) => `<button type="button" class="ex">${esc(x)}</button>`).join("")}</div></div>` +
    `<div class="sec"><h2>Avisos${mine.length ? ` (${mine.length})` : ""}</h2><div class="b">${mine.map((x) => `<div class="issue ${x.level}">${esc(x.message)}</div>`).join("") || `<div class="issue ok">Sin avisos aquí.</div>`}</div></div>`;
}
props.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>(".ex");
  if (!b) return;
  const input = $<HTMLInputElement>("cmd-input");
  input.value = b.textContent ?? "";
  input.focus();
});

function renderIssues() {
  issues = checkWorld(world);
  const real = issues.filter((i) => i.level !== "tip");
  const first = real.find((i) => i.level === "error") ?? real[0];
  // Una sola línea sobre la vista; el detalle completo vive en el panel de la derecha.
  $("issues").innerHTML = first
    ? `<button type="button" class="issue ${first.level}" id="issue-first">${real.length > 1 ? `${real.length} avisos · ` : ""}${esc(first.message.length > 110 ? first.message.slice(0, 108) + "…" : first.message)}</button>`
    : world.items.length ? `<div class="issue ok">Todo cabe y abre sin chocar.</div>` : "";
  const btn = document.getElementById("issue-first");
  if (btn) btn.onclick = () => select(first!.itemId ? { kind: "item", itemId: first!.itemId } : first!.roomId ? { kind: "room", roomId: first!.roomId } : { kind: "world" });
}

let quoteRun = 0;
let lastQuote: WorldQuote | undefined;
/** Cajas según la presentación de la tienda que cotizó ese piso; undefined si no hay precio. */
function boxesFor(roomName: string, tilesToBuy: number): string | undefined {
  const line = lastQuote?.lines.find((l) => l.category === "tile" && l.description.startsWith(`${roomName} · `) && !l.missing);
  const perBox = Number(line?.offer?.attributes?.piecesPerBox);
  return line && perBox ? `${Math.ceil(tilesToBuy / perBox)} de ${perBox} piezas · ${line.offer!.store}` : undefined;
}
async function renderPrice() {
  const run = ++quoteRun;
  const hasFloor = world.rooms.some((r) => r.floor), nPoints = world.rooms.reduce((a, r) => a + (r.points?.length ?? 0), 0);
  if (!world.items.length && !hasFloor && !nPoints) { $("price-total").textContent = "—"; $("price-sub").textContent = "sin muebles ni pisos todavía"; $("price-pop").innerHTML = `<span class="muted">Coloca un mueble o define un piso para ver su costo.</span>`; return; }
  const own = book.entries.length > 0;
  const q: WorldQuote = await quoteWorld(world, activeProviders(book, providers), undefined, { today: today() });
  if (run !== quoteRun) return;
  lastQuote = q;
  renderProps();
  const cur = q.currency === "?" ? book.currency : q.currency;
  $("price-total").textContent = money(q.subtotal, cur);
  const parts = [world.items.length ? `${world.items.length} mueble(s)` : "", hasFloor ? `${world.rooms.filter((r) => r.floor).length} piso(s)` : "", nPoints ? `${nPoints} punto(s) de instalación` : ""].filter(Boolean).join(" + ");
  $("price-sub").textContent = `${cur} · ${parts}${q.missingCount ? ` · faltan ${q.missingCount} precios` : ""} · ${own ? "tus precios" : "precios de ejemplo"}`;
  const old = (l: WorldQuote["lines"][number]) => own && l.offer && priceAgeDays(l.offer.fetchedAt, today()) > 30;
  const where = (l: WorldQuote["lines"][number]) => (own && l.offer ? `<small class="muted"> · ${esc(l.offer.store)}${old(l) ? " · precio viejo" : ""}</small>` : "");
  const groupRows = ([["Muebles", q.groups.furniture], ["Pisos", q.groups.floors], ["Eléctrico", q.groups.electrical], ["Agua y gas", q.groups.services]] as [string, number][]).filter(([, v]) => v > 0);
  $("price-pop").innerHTML =
    (groupRows.length > 1 ? groupRows.map(([label, value]) => `<span class="pl"><strong>${label}</strong><span class="num">${money(value, cur)}</span></span>`).join("") : "") +
    q.lines.map((l) => `<span class="pl${l.missing ? " missing" : ""}"><span>${esc(l.description)} × ${l.qty}${where(l)}</span><span class="num">${l.missing ? "sin precio" : money(l.total, cur)}</span></span>`).join("") +
    (own && q.byStore.length > 1 ? `<span class="pl stores"><strong>Por tienda</strong><span></span></span>` + q.byStore.map((s) => `<span class="pl"><span>${esc(s.store)} · ${s.lines} renglón(es)</span><span class="num">${money(s.total, cur)}</span></span>`).join("") : "") +
    (own
      ? `<span class="muted">Tus precios${q.oldestPrice ? `, el más viejo del ${esc(q.oldestPrice)}` : ""}.${q.staleCount ? ` ${q.staleCount} con más de 30 días: conviene revisarlos.` : ""}${q.missingCount ? ` Faltan ${q.missingCount}: el total aún no está completo.` : ""}</span>`
      : `<span class="muted">Precios de ejemplo en dólares, no reales. Anota los tuyos: "precio melamina blanco 185.000 en Madecentro", o pídeselos a tu IA.</span>`) +
    `<button type="button" class="btn" id="ask-prices">${q.missingCount || !own ? "Copiar lista de precios para mi IA" : "Pedir a mi IA que revise los precios"}</button>`;
  $("ask-prices").onclick = () => {
    const wanted = own ? q.lines.filter((l) => l.missing || old(l)) : q.lines;
    const list = [...new Map((wanted.length ? wanted : q.lines).map((l) => [needKey(l.need), l])).values()].map((l) => `- ${l.description}`).join("\n");
    void copyForAi(`En mi mundo de Handy "${world.name}" necesito precios reales de hoy. Usa prices_needed para ver las claves, búscalos en Homecenter y Madecentro (Colombia) y anótalos con price_set, con tienda y enlace:\n${list}`);
  };
}

/** Anota o borra un precio propio escrito en la barra de órdenes. */
async function applyPriceCommand(text: string): Promise<boolean> {
  // "¿cuánto cuesta?" es una pregunta, no un precio que anotar.
  if (/cu[aá]nto/i.test(text)) {
    const q = lastQuote;
    toast(q ? `Va en ${money(q.subtotal, q.currency === "?" ? book.currency : q.currency)}${q.missingCount ? `, y faltan ${q.missingCount} precios por anotar` : ""}. Pasa el mouse por el precio para ver el detalle.` : "Aún no hay nada que cotizar.");
    return true;
  }
  const lines = (lastQuote ?? (await quoteWorld(world, activeProviders(book, providers), undefined, { today: today() }))).lines;
  const result = runPriceCommand(book, lines, text, today(), (n) => money(n, book.currency));
  if (result.ok) { await savePrices(); await renderPrice(); }
  toast(result.message, !result.ok);
  return result.ok;
}

function refresh() {
  $("world-name").textContent = world.name;
  buildScene();
  renderIssues();
  renderTree();
  renderProps();
  void renderPrice();
  select(selectionExists(selection) ? selection : { kind: "world" });
}

// ---------- Comandos ----------

let toastTimer = 0;
function toast(message: string, bad = false, aiPrompt?: string) {
  const el = $("toast");
  el.className = `show${bad ? " bad" : ""}`;
  el.innerHTML = esc(message) + (aiPrompt ? `<button type="button" class="btn" id="copy-ai">Copiar para mi IA</button>` : "");
  if (aiPrompt) $("copy-ai").onclick = () => { void copyForAi(aiPrompt); };
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el.className = ""; }, aiPrompt ? 12000 : 5000);
}

/** Copia un texto para pegarlo en la IA; si el navegador no deja, lo muestra para copiarlo a mano. */
async function copyForAi(textToCopy: string): Promise<void> {
  try {
    if (!navigator.clipboard) throw new Error("sin portapapeles");
    await navigator.clipboard.writeText(textToCopy);
    toast("Copiado. Pégalo en tu IA conectada a Handy.");
  } catch {
    window.prompt("Tu navegador no dejó copiar. Copia este texto y pégalo en tu IA:", textToCopy);
  }
}

/** Aplica una orden sobre la selección actual, igual si viene de la barra o del teclado. */
async function applyCommand(text: string, quiet = false): Promise<boolean> {
  const before = JSON.stringify(world);
  const footprint = () => JSON.stringify(world.rooms.map((r) => [r.origin, r.width, r.depth]));
  const shape = footprint();
  // "sol a las 3 pm" no cambia el mundo: cambia lo que se está mirando.
  const sunQuery = parseSunQuery(text, new Date().getFullYear());
  if (sunQuery) {
    if (sunQuery.off) { hideSun(); toast("Sol oculto."); return true; }
    if (!showSun(sunQuery)) return false;
    toast($("sun-note").textContent ?? "");
    return true;
  }
  // Los precios no cambian el mundo: van al libro de precios propio.
  if (isPriceCommand(text)) return applyPriceCommand(text);
  // "¿cómo se arma?" no cambia el mundo: entrega el manual del mueble seleccionado.
  if (/\b(c[oó]mo\s+(se|lo|la)\s+arm|instrucciones|manual\s+de\s+armado|pasos\s+de\s+armado)/i.test(text)) return exportAssembly();
  const result = runCommand(world, selection, text);
  if (result.ok) {
    history.push(before);
    if (result.select !== undefined) selection = result.select ?? { kind: "world" };
    await saveWorld();
    refresh();
    // Si la casa cambió de tamaño o forma, se vuelve a encuadrar para que no quede fuera de la vista.
    if (footprint() !== shape) frameWorld();
    toast(result.message);
    return true;
  }
  if (!result.understood) toast(result.message, true, `En mi mundo de Handy "${world.name}", sobre ${selectionLabel(selection)}: ${text}`);
  else if (!quiet) toast(result.message, true);
  return false;
}

$("cmd").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>("cmd-input");
  const text = input.value.trim();
  if (text && (await applyCommand(text))) input.value = "";
});

// Flechas: mueven lo seleccionado 10 mm (con Mayús, 100). Supr lo quita. Esc cancela un arrastre.
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { cancelDrag(); return; }
  const input = $<HTMLInputElement>("cmd-input");
  const typing = document.activeElement === input && input.value !== "";
  if (typing || (selection.kind !== "item" && selection.kind !== "opening" && selection.kind !== "block" && selection.kind !== "point") || e.ctrlKey || e.metaKey || e.altKey) return;
  const step = e.shiftKey ? 100 : 10;
  if (selection.kind === "point") {
    const sel = selection;
    const light = world.rooms.find((r) => r.id === sel.roomId)?.points?.find((p) => p.id === sel.pointId)?.kind === "light";
    const order = e.key === "Delete" && document.activeElement !== input ? "quítala"
      : light ? (e.key === "ArrowRight" ? `muévela ${step} mm al este` : e.key === "ArrowLeft" ? `muévela ${step} mm al oeste` : e.key === "ArrowUp" ? `muévela ${step} mm al norte` : e.key === "ArrowDown" ? `muévela ${step} mm al sur` : null)
      : e.key === "ArrowRight" ? `muévela ${step} mm a la derecha` : e.key === "ArrowLeft" ? `muévela ${step} mm a la izquierda` : e.key === "ArrowUp" ? `súbela ${step} mm` : e.key === "ArrowDown" ? `bájala ${step} mm` : null;
    if (order) { e.preventDefault(); void applyCommand(order, true); }
    return;
  }
  if (selection.kind === "block") {
    const to = e.key === "ArrowRight" ? "este" : e.key === "ArrowLeft" ? "oeste" : e.key === "ArrowUp" ? "norte" : e.key === "ArrowDown" ? "sur" : null;
    const order = to ? `muévela ${step} mm al ${to}` : e.key === "Delete" && document.activeElement !== input ? "quítala" : null;
    if (order) { e.preventDefault(); void applyCommand(order, true); }
    return;
  }
  const it = selection.kind === "item";
  // Un mueble suelto se aleja o se acerca a su muro con arriba y abajo; uno pegado sube y baja. R lo gira.
  const loose = it && (world.items.find((i) => i.id === (selection as { itemId: string }).itemId)?.gap ?? 0) > 0;
  const cmd = e.key === "ArrowRight" ? `muévelo ${step} mm a la derecha` : e.key === "ArrowLeft" ? `muévelo ${step} mm a la izquierda`
    : loose && e.key === "ArrowUp" ? `aléjalo ${step} mm` : loose && e.key === "ArrowDown" ? `acércalo ${step} mm`
    : it && (e.key === "r" || e.key === "R") && document.activeElement !== input ? "gíralo"
    : it && e.key === "ArrowUp" ? `súbelo ${step} mm` : it && e.key === "ArrowDown" ? `bájalo ${step} mm`
    : e.key === "Delete" && document.activeElement !== input ? "quita" : null;
  if (!cmd) return;
  e.preventDefault();
  void applyCommand(cmd, true);
});

async function undo() {
  const prev = history.pop();
  if (!prev) { toast("No hay nada que deshacer."); return; }
  world = JSON.parse(prev);
  await saveWorld();
  refresh();
  toast("Deshecho.");
}
$("undo").onclick = () => void undo();
$("frame").onclick = () => frameWorld();
window.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "z" && document.activeElement?.id !== "cmd-input") { e.preventDefault(); void undo(); } });

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
const fileBase = () => world.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-") || "mundo";
$("export-world").onclick = () => download(`${fileBase()}.world.json`, JSON.stringify(world, null, 2), "application/json");
$("export-gltf").onclick = () => { download(`${fileBase()}.gltf`, exportGltf(world), "model/gltf+json"); toast("Listo. En Blender: File › Import › glTF 2.0."); };
$("export-cut").onclick = () => {
  if (!world.items.length) { toast("Aún no hay muebles que cortar.", true); return; }
  download(`${fileBase()}-despiece.html`, cutSheetHtml(mergedModel(world), world.name), "text/html");
  toast("Despiece listo: ábrelo e imprímelo para llevarlo a la tienda.");
};
/** Abre el armado paso a paso del mueble seleccionado, o del único que haya. */
let assembly: AssemblyHandle | undefined;
function exportAssembly(): boolean {
  const item = selection.kind === "item" ? world.items.find((i) => i.id === (selection as { itemId: string }).itemId) : world.items.length === 1 ? world.items[0] : undefined;
  if (!item) { toast(world.items.length ? "Haz clic en un mueble para ver cómo se arma." : "Aún no hay muebles que armar.", true); return false; }
  assembly?.close();
  assembly = openAssembly(app, itemModel(item), item.name, (level, html) => {
    download(`${fileBase()}-armado-${item.id}-${level}.html`, html, "text/html");
    toast("Manual listo: ábrelo e imprímelo. Al final trae el plano de perforación de cada pieza.");
  }, () => { assembly = undefined; });
  return true;
}
$("export-assembly").onclick = () => { exportAssembly(); };
$("import").onclick = () => $<HTMLInputElement>("file").click();
$<HTMLInputElement>("file").onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const w = JSON.parse(await f.text()) as World;
    if (w.version !== 1 || !Array.isArray(w.rooms) || !Array.isArray(w.items)) throw new Error("no es un mundo de Handy");
    history.push(JSON.stringify(world));
    world = w; selection = { kind: "world" };
    await saveWorld(); refresh(); frameWorld();
    toast(`Mundo "${w.name}" abierto.`);
  } catch (err) { toast(`No pude abrir ese archivo: ${(err as Error).message}.`, true); }
};

const THEMES = ["auto", "dark", "light"] as const;
$("theme").onclick = () => {
  const next = THEMES[(THEMES.indexOf(app.dataset.theme as (typeof THEMES)[number]) + 1) % THEMES.length];
  app.dataset.theme = next;
  try { localStorage.setItem("handy.theme", next); } catch { /* sin almacenamiento */ }
  $("theme").textContent = `Tema: ${next === "auto" ? "auto" : next === "dark" ? "oscuro" : "claro"}`;
  themeBackground();
};
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", themeBackground);

// ---------- Arranque ----------

try { const t = localStorage.getItem("handy.theme"); if (t && (THEMES as readonly string[]).includes(t)) app.dataset.theme = t; } catch { /* sin almacenamiento */ }
$("theme").textContent = `Tema: ${app.dataset.theme === "auto" ? "auto" : app.dataset.theme === "dark" ? "oscuro" : "claro"}`;
themeBackground();
await loadWorld();
await loadPrices();
resize();
refresh();
frameWorld();
listenForExternalChanges();
// Para pruebas automáticas.
const toScreen = (v: THREE.Vector3) => {
  const r = renderer.domElement.getBoundingClientRect();
  const q = v.clone().project(camera);
  return { x: r.left + ((q.x + 1) / 2) * r.width, y: r.top + ((1 - q.y) / 2) * r.height };
};
(window as unknown as Record<string, unknown>).__handy = {
  ready: true, getWorld: () => world, select, getSelection: () => selection, getPrices: () => book, bands: () => bands.length, rounded: () => pickables.filter((m) => m.userData.rounded).map((m) => ({ radius: m.userData.rounded, vertices: (m.geometry as unknown as THREE.BufferGeometry).getAttribute("position").count })), sun: () => ({ view: sunView, patches: sunMeshes.length, note: $("sun-note").textContent }), pointScreen: (roomId: string, pointId: string) => { const r = world.rooms.find((x) => x.id === roomId), p = r?.points?.find((x) => x.id === pointId); if (!r || !p) return null; const [x, y, z] = pointPosition(r, p); return toScreen(new THREE.Vector3(x * M, (p.kind === "light" ? y - 20 : y) * M, z * M)); }, getQuote: () => lastQuote, assembly: () => assembly,
  /** Punto en pantalla del centro del frente de lo seleccionado, y de sus manijas. */
  selectionScreen: () => { const t = dragTarget(selection); if (!t) return null; const [x, y, z] = wallPoint(t.room, t.wall, t.offset + t.width / 2, t.base + t.height / 2, t.front); return toScreen(new THREE.Vector3(x * M, y * M, z * M)); },
  handleScreen: (kind: string) => { const h = handles.find((m) => m.userData.handle === kind); return h ? toScreen(h.getWorldPosition(new THREE.Vector3())) : null; },
  dimLabels: () => [...dimsLayer.querySelectorAll(".dim")].map((n) => n.textContent),
};
