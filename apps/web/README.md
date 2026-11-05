# @handy/web (en diseño)

Editor 3D en navegador. Plan en `docs/03-roadmap.md` (M2).

Stack previsto: Vite + React + react-three-fiber + zustand. Consume `@handy/core` directamente (sin servidor) y guarda proyectos `.handy.json` en el navegador o en disco.

Pantalla principal:

```
┌────────────────────────────────────────────────────────────────┐
│ Handy  [Proyecto ▾]  [Mueble ▾]  [Espacio]  [Arquitectura]     │
├──────────────┬─────────────────────────────────┬───────────────┤
│ Parámetros   │                                 │ Cotización    │
│ ancho  800   │        visor 3D                 │ Melamina  2x  │
│ alto  2000   │   (arrastra caras para          │ HDF       1x  │
│ prof   500   │    cambiar medidas)             │ Herrajes  ... │
│ repisas  3   │                                 │ ───────────   │
│ puertas  2   │                                 │ 138,65 USD    │
│ unión minifix│                                 │ hace 2 días   │
├──────────────┴─────────────────────────────────┴───────────────┤
│ Avisos: [warning] Repisa 764 mm en 18 mm ... [tip] ...         │
│ > comando: "ensancha 10 cm"                                     │
└────────────────────────────────────────────────────────────────┘
```
