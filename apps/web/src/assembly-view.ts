import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ASSEMBLY_LEVELS, assemblyHtml, assemblyScene, buildAssemblyPlan, type AssemblyLevel, type AssemblyPlan, type FurnitureModel } from "@handy/core";

/**
 * Armado paso a paso en 3D: el mueble aislado, las piezas de cada paso llegando a su sitio,
 * los puntos donde va cada herraje y, al lado, qué hacer y qué comprobar. Tres niveles de detalle.
 */
export interface AssemblyHandle {
  close(): void;
  go(step: number): void;
  setLevel(level: AssemblyLevel): void;
  state(): { level: AssemblyLevel; step: number; steps: number; title: string; fresh: string[]; points: number; lying: boolean; actions: number; visible: number; progress: number };
}

const M = 0.001;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const LEVEL_KEY = "handy.assembly.level";

export function openAssembly(host: HTMLElement, model: FurnitureModel, name: string, onDownload: (fileSuffix: string, html: string) => void, onClose: () => void): AssemblyHandle {
  let level: AssemblyLevel = "guided";
  try { const saved = localStorage.getItem(LEVEL_KEY) as AssemblyLevel | null; if (saved && ASSEMBLY_LEVELS.some((l) => l.id === saved)) level = saved; } catch { /* sin almacenamiento */ }
  let plan: AssemblyPlan = buildAssemblyPlan(model, level);
  let step = 0;

  const el = document.createElement("div");
  el.id = "asm";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", `Armado de ${name}`);
  el.innerHTML = `
    <header class="asm-top">
      <strong>Armado · ${esc(name)}</strong><span class="muted" id="asm-meta"></span><span class="grow"></span>
      <div class="seg" role="radiogroup" aria-label="Nivel de detalle">${ASSEMBLY_LEVELS.map((l) => `<button type="button" role="radio" data-level="${l.id}" title="${esc(l.hint)}">${l.name}</button>`).join("")}</div>
      <button type="button" class="btn" id="asm-print">Manual para imprimir</button>
      <button type="button" class="btn" id="asm-close">Cerrar</button>
    </header>
    <div class="asm-body">
      <ol id="asm-steps" aria-label="Pasos"></ol>
      <div id="asm-stage">
        <div id="asm-labels" aria-hidden="true"></div>
        <div class="asm-bar">
          <button type="button" class="btn" id="asm-prev" aria-label="Paso anterior">‹ Anterior</button>
          <button type="button" class="btn" id="asm-replay">Repetir</button>
          <button type="button" class="btn" id="asm-fit">Encuadrar</button>
          <span class="asm-progress" aria-hidden="true"><i id="asm-fill"></i></span>
          <span class="num" id="asm-count"></span>
          <button type="button" class="btn primary" id="asm-next" aria-label="Paso siguiente">Siguiente ›</button>
        </div>
      </div>
      <aside id="asm-info" aria-live="polite"></aside>
    </div>`;
  host.appendChild(el);
  const $ = <T extends HTMLElement>(id: string) => el.querySelector<T>(`#${id}`)!;
  const stage = $("asm-stage"), labels = $("asm-labels");

  // ---------- Escena ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const root = new THREE.Group();
  scene.add(root);
  const css = (v: string) => getComputedStyle(el).getPropertyValue(v).trim();
  let colors = { bg: "", fill: "", line: "", accent: "", fresh: "" };
  const readColors = () => {
    const mix = (a: string, b: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`;
    colors = { bg: css("--bg"), fill: css("--panel-2"), line: css("--text-2"), accent: css("--accent"), fresh: mix(css("--panel"), css("--accent"), 0.28) };
    scene.background = new THREE.Color(colors.bg);
  };

  interface Piece { id: string; group: THREE.Group; from?: THREE.Vector3; home: THREE.Vector3; fresh: boolean }
  let pieces: Piece[] = [];
  let dots: THREE.Mesh[] = [];
  let lying = false, tilt = 0, started = 0, progress = 1;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tall = model.dims.height * M;

  function clearScene() {
    for (const child of [...root.children]) {
      root.remove(child);
      child.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose()); });
    }
    pieces = []; dots = [];
    labels.innerHTML = "";
  }

  function buildStep(refit: boolean) {
    clearScene();
    const s = plan.steps[step];
    // Un paso sin piezas ni herrajes que señalar (reconocer piezas, pintar) muestra el mueble terminado o lo ya armado.
    let view = assemblyScene(model, plan, step);
    if (!view.solids.length) view = { ...assemblyScene(model, plan), lying: false, points: [] };
    const letter = new Map(plan.parts.map((p) => [p.id, p.letter]));
    const labelled = new Set<string>();
    for (const b of view.solids) {
      const size = new THREE.Vector3((b.box.max[0] - b.box.min[0]) * M, (b.box.max[1] - b.box.min[1]) * M, (b.box.max[2] - b.box.min[2]) * M);
      const geo = new THREE.BoxGeometry(Math.max(size.x, 0.0008), Math.max(size.y, 0.0008), Math.max(size.z, 0.0008));
      const g = new THREE.Group();
      // Sin luces: cada cara lleva su tono fijo, como en un dibujo de manual, para que se lea el volumen.
      const base = new THREE.Color(b.fresh ? colors.fresh : colors.fill);
      const tone = (t: number) => new THREE.MeshBasicMaterial({ color: base.clone().lerp(new THREE.Color(t > 0 ? "#ffffff" : "#000000"), Math.abs(t)), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      g.add(new THREE.Mesh(geo, [tone(0.03), tone(-0.1), tone(0.12), tone(-0.22), tone(-0.06), tone(-0.16)]));
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: b.fresh ? colors.accent : colors.line })));
      const home = new THREE.Vector3((b.box.min[0] + b.box.max[0]) / 2 * M, (b.box.min[1] + b.box.max[1]) / 2 * M, (b.box.min[2] + b.box.max[2]) / 2 * M);
      g.position.copy(home);
      root.add(g);
      const piece: Piece = { id: b.id, group: g, home, fresh: b.fresh, ...(b.from ? { from: new THREE.Vector3(b.from[0] * M, b.from[1] * M, b.from[2] * M) } : {}) };
      pieces.push(piece);
      if (b.fresh && !labelled.has(b.id)) {
        labelled.add(b.id);
        const tag = document.createElement("span");
        tag.className = "asm-tag";
        tag.textContent = letter.get(b.id) ?? "";
        tag.dataset.piece = String(pieces.length - 1);
        labels.appendChild(tag);
      }
    }
    for (const p of view.points) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), new THREE.MeshBasicMaterial({ color: colors.accent, depthTest: false, transparent: true, opacity: 0.95 }));
      dot.renderOrder = 10;
      dot.position.set(p[0] * M, p[1] * M, p[2] * M);
      root.add(dot);
      dots.push(dot);
    }
    const turned = lying !== view.lying;
    lying = view.lying;
    if (reduced) tilt = lying ? 1 : 0;
    started = performance.now();
    progress = reduced || !pieces.some((p) => p.from) ? 1 : 0;
    place();
    if (refit || turned) fit();
    renderInfo();
    void s;
  }

  /** Coloca piezas y mueble según el avance de la animación. */
  function place() {
    const e = 1 - Math.pow(1 - progress, 3);
    for (const p of pieces) p.group.position.copy(p.home).addScaledVector(p.from ?? new THREE.Vector3(), 1 - e);
    // Acostado sobre el costado izquierdo: gira un cuarto de vuelta y queda apoyado en el piso.
    root.rotation.z = (tilt * Math.PI) / 2;
    root.position.set(tall * Math.sin((tilt * Math.PI) / 2), 0, 0);
  }

  function fit() {
    const keepTilt = tilt, keepProgress = progress;
    tilt = lying ? 1 : 0; progress = 0; place();
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    progress = 1; place(); root.updateMatrixWorld(true);
    box.union(new THREE.Box3().setFromObject(root));
    tilt = keepTilt; progress = keepProgress; place();
    const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 0.2);
    const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.08;
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(0.9, 0.62, 1).normalize().multiplyScalar(dist));
    camera.near = dist / 100; camera.far = dist * 10;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  let raf = 0, alive = true;
  const tmp = new THREE.Vector3();
  function frame(now: number) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const target = lying ? 1 : 0;
    if (tilt !== target) tilt = Math.abs(target - tilt) < 0.02 ? target : tilt + (target - tilt) * 0.14;
    if (progress < 1 && tilt === target) progress = Math.min(1, Math.max(0, (now - started - 450) / 1300));
    else if (tilt !== target) started = now;
    place();
    const pulse = 1 + 0.25 * Math.sin(now / 260);
    for (const d of dots) d.scale.setScalar(pulse);
    controls.update();
    renderer.render(scene, camera);
    const w = stage.clientWidth, h = stage.clientHeight;
    for (const tag of labels.children as unknown as HTMLElement[]) {
      const p = pieces[Number(tag.dataset.piece)];
      p.group.getWorldPosition(tmp).project(camera);
      tag.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -50%)`;
      tag.style.visibility = tmp.z < 1 ? "visible" : "hidden";
    }
  }

  // ---------- Paneles ----------
  function renderList() {
    $("asm-steps").innerHTML = plan.steps.map((s, i) => `<li><button type="button" data-step="${i}" class="${i === step ? "on" : i < step ? "done" : ""}"${i === step ? ' aria-current="step"' : ""}><span class="num">${s.n}</span><span>${esc(s.title)}</span></button></li>`).join("");
    for (const b of $("asm-steps").querySelectorAll<HTMLButtonElement>("button")) b.onclick = () => go(Number(b.dataset.step));
    $("asm-steps").querySelector(".on")?.scrollIntoView({ block: "nearest" });
    const hours = plan.minutes >= 60 ? `${Math.floor(plan.minutes / 60)} h${plan.minutes % 60 ? ` ${plan.minutes % 60} min` : ""}` : `${plan.minutes} min`;
    $("asm-meta").textContent = `${plan.steps.length} pasos · unas ${hours}`;
    for (const b of el.querySelectorAll<HTMLButtonElement>(".seg button")) { const on = b.dataset.level === level; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); }
  }

  function renderInfo() {
    const s = plan.steps[step];
    const chips = s.partIds.map((id) => plan.parts.find((p) => p.id === id)).filter((p) => !!p).map((p) => `<span class="asm-chip"><b>${p!.letter}</b> ${esc(p!.name)} × ${p!.qty}<small class="num"> ${esc(p!.size)}</small></span>`).join("");
    $("asm-info").innerHTML = `
      <p class="muted">Paso ${s.n} de ${plan.steps.length} · unos ${s.minutes >= 60 ? `${Math.floor(s.minutes / 60)} h ${s.minutes % 60} min` : `${s.minutes} min`}</p>
      <h2>${esc(s.title)}</h2>
      ${s.text ? `<p>${esc(s.text)}</p>` : ""}
      ${s.actions.length ? `<ol class="asm-acts">${s.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ol>` : ""}
      ${s.points.length ? `<p class="asm-hint"><i></i> Los ${s.points.length} puntos que laten marcan dónde va cada herraje.</p>` : ""}
      ${s.checks.length ? `<h3>Antes de seguir</h3><ul class="asm-checks">${s.checks.map((c, i) => `<li><label><input type="checkbox" id="asm-check-${i}"> ${esc(c)}</label></li>`).join("")}</ul>` : ""}
      ${s.tip ? `<p class="asm-tip">${esc(s.tip)}</p>` : ""}
      ${chips ? `<h3>Piezas de este paso</h3><div class="asm-chips">${chips}</div>` : ""}
      ${s.hardware.length ? `<h3>Herrajes</h3><div class="asm-chips">${s.hardware.map((h) => `<span class="asm-chip hw"><b>${h.qty} ×</b> ${esc(h.name)}</span>`).join("")}</div>` : ""}
      ${s.tools.length ? `<h3>Herramientas</h3><p class="muted">${esc(s.tools.join(", "))}.</p>` : ""}`;
    $("asm-info").scrollTop = 0;
    $("asm-count").textContent = `${step + 1} / ${plan.steps.length}`;
    $("asm-fill").style.width = `${((step + 1) / plan.steps.length) * 100}%`;
    ($("asm-prev") as HTMLButtonElement).disabled = step === 0;
    $("asm-next").textContent = step === plan.steps.length - 1 ? "Terminar" : "Siguiente ›";
    $("asm-replay").hidden = !pieces.some((p) => p.from);
    renderList();
  }

  function go(i: number) {
    if (i >= plan.steps.length) { close(); return; }
    step = Math.max(0, i);
    buildStep(false);
  }

  function setLevel(next: AssemblyLevel) {
    if (next === level) return;
    // Se conserva el punto del armado: el paso del nuevo nivel donde entra la misma pieza.
    const anchor = plan.steps.slice(0, step + 1).reverse().find((s) => s.partIds.length)?.partIds[0];
    level = next;
    try { localStorage.setItem(LEVEL_KEY, level); } catch { /* sin almacenamiento */ }
    plan = buildAssemblyPlan(model, level);
    step = Math.max(0, anchor ? plan.steps.findIndex((s) => s.partIds.includes(anchor)) : 0);
    buildStep(true);
  }

  function onKey(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement)?.tagName === "INPUT" && (e.target as HTMLInputElement).type !== "checkbox";
    if (typing) return;
    const handled = e.key === "ArrowRight" ? (go(step + 1), true) : e.key === "ArrowLeft" ? (go(step - 1), true) : e.key === "Escape" ? (close(), true) : e.key === "r" || e.key === "R" ? (buildStep(false), true) : false;
    // El visor de atrás también escucha el teclado: mientras el armado está abierto, las teclas son suyas.
    if (handled) e.preventDefault();
    e.stopImmediatePropagation();
  }

  function close() {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    observer.disconnect();
    window.removeEventListener("keydown", onKey, true);
    themeWatch.disconnect();
    clearScene();
    controls.dispose();
    renderer.dispose();
    el.remove();
    onClose();
  }

  for (const b of el.querySelectorAll<HTMLButtonElement>(".seg button")) b.onclick = () => setLevel(b.dataset.level as AssemblyLevel);
  $("asm-prev").onclick = () => go(step - 1);
  $("asm-next").onclick = () => go(step + 1);
  $("asm-replay").onclick = () => buildStep(false);
  $("asm-fit").onclick = fit;
  $("asm-close").onclick = close;
  $("asm-print").onclick = () => onDownload(level, assemblyHtml(model, name, level));
  window.addEventListener("keydown", onKey, true);
  // Si cambia el tema, se vuelven a leer los colores.
  const themeWatch = new MutationObserver(() => { readColors(); buildStep(false); });
  themeWatch.observe(host, { attributes: true, attributeFilter: ["data-theme"] });

  readColors();
  resize();
  buildStep(true);
  raf = requestAnimationFrame(frame);
  $("asm-next").focus();

  return {
    close, go, setLevel,
    state: () => ({ level, step, steps: plan.steps.length, title: plan.steps[step].title, fresh: [...new Set(pieces.filter((p) => p.fresh).map((p) => p.id))], points: dots.length, lying, actions: plan.steps[step].actions.length, visible: pieces.length, progress }),
  };
}
