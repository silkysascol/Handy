# ADR-0001: Stack tecnológico

**Estado**: aceptada · **Fecha**: 2026-11-05

## Contexto

Handy debe correr en navegador y como ejecutable, ser usable por IAs, y mantener un único motor de cálculo.

## Decisión

- Motor en **TypeScript** (`@handy/core`), sin dependencias de UI ni de Node en su API pública.
- Interfaz web con **React + react-three-fiber (Three.js)**.
- Ejecutable con **Tauri 2** (Rust): empaqueta la web, expone API HTTP local y lanza el MCP.
- Geometría: muebles como cajas posicionadas; piezas imprimibles con **manifold-3d** (WASM).
- Monorepo **pnpm**; tests con **vitest**; CI en GitHub Actions.

## Alternativas descartadas

- Electron: binarios de 150+ MB y mayor consumo. Tauri entrega 5–15 MB.
- Python + FreeCAD/CadQuery para el motor: potente, pero no corre en navegador y complica el ejecutable.
- OpenCascade.js: kernel completo, pero pesado (30 MB WASM) e innecesario para muebles de tablero.

## Consecuencias

Si una parte de la geometría se vuelve lenta en JS, se portará a Rust/WASM dentro del mismo repo. Las normativas y catálogos viven como datos, no como código.
