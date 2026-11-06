# Arquitectura

## Vista general

```
┌──────────────────────────────────────────────────────────────────────┐
│  Interfaces                                                          │
│  ┌────────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────────┐  │
│  │ App web    │  │ Escritorio   │  │ CLI       │  │ Servidor MCP  │  │
│  │ React +    │  │ Tauri (.exe, │  │ handy ... │  │ stdio / HTTP  │  │
│  │ Three.js   │  │ .dmg, .deb)  │  │           │  │ para IAs      │  │
│  └─────┬──────┘  └──────┬───────┘  └─────┬─────┘  └──────┬────────┘  │
│        └────────────────┴────────────────┴───────────────┘           │
│                                 │                                    │
│  ┌──────────────────────────────▼─────────────────────────────────┐  │
│  │  @handy/core (TypeScript, corre en navegador y Node)           │  │
│  │  modelo · generadores · lista de corte · reglas · cotización   │  │
│  │  espacios (LiDAR) · arquitectura (sol, enchufes, tuberías)     │  │
│  │  piezas 3D (CSG paramétrico)                                   │  │
│  └──────────────────────────────┬─────────────────────────────────┘  │
│                                 │                                    │
│  ┌────────────┐  ┌──────────────▼──────┐  ┌─────────────────────┐    │
│  │ Catálogos  │  │ Proveedores de      │  │ Datos por país      │    │
│  │ JSON       │  │ precios (plugins)   │  │ normativas, medidas │    │
│  └────────────┘  └─────────────────────┘  └─────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

## Paquetes

| Paquete | Rol | Estado |
| --- | --- | --- |
| `packages/core` | Motor puro, sin dependencias de UI. Todo lo que calcula Handy vive aquí. | Funcional (gabinete, corte, reglas, cotización) |
| `packages/spaces` | Editor de mapa (muros con grosor, aberturas, niveles, recintos), importación de escaneos (RoomPlan JSON, USDZ, glTF, OBJ, PLY), puntos eléctricos e inferencia de canalización, colisiones. | Planificado |
| `packages/arch` | Sol (posición solar, sombras, horas de sol por fachada), estándares eléctricos y sanitarios por país. | Planificado |
| `packages/objects` | Piezas paramétricas imprimibles (CSG con manifold-3d). | Planificado |
| `packages/structure` | Simulación de esfuerzos: analítico y método de rigidez; propiedades de materiales. | Planificado |
| `packages/export` | glTF/GLB, OBJ, STL/3MF, DXF/SVG, PDF, CSV; más adelante IFC y USDZ. | Planificado |
| `packages/masonry` | Muebles de ladrillo (asador, mesón): aparejos, conteo de ladrillos y mortero. | Planificado |
| `packages/providers-*` | Adaptadores de tiendas por país (`providers-cl`, `providers-co`, ...). | Planificado |
| `apps/web` | Editor en navegador con las tres secciones (Espacios, Muebles, Objetos). Es la interfaz principal; el ejecutable la empaqueta. | Diseño |
| `apps/desktop` | Tauri: empaqueta la web, expone API local y MCP, acceso a archivos. | Diseño |
| `apps/mcp-server` | Servidor MCP stdio (y más adelante HTTP) sobre `core`. | Funcional (3 herramientas) |

## Decisiones clave (ver `docs/decisiones/`)

- **TypeScript para el motor** para que el mismo código corra en navegador, Node y dentro del ejecutable. Rust/WASM solo para geometría pesada (booleanos de malla) si hace falta.
- **Tauri para el ejecutable**: binarios pequeños, usa el webview del sistema, backend Rust para acceso a disco, puertos locales y procesos. Alternativa Electron descartada por tamaño.
- **Three.js (react-three-fiber)** para el visor 3D. Los muebles de tablero se modelan como cajas posicionadas (no hace falta un kernel CAD). Para piezas imprimibles se usa CSG con `manifold-3d` (WASM).
- **MCP como interfaz para IAs**. El servidor expone herramientas tipadas; cualquier cliente MCP (Claude Desktop, Claude Code, Cursor, agentes locales con Ollama vía bridge) puede usarlas. El escritorio también publica un endpoint HTTP local con el mismo esquema (OpenAPI) para IAs que no hablan MCP.
- **Proveedores de precios como plugins** con una interfaz mínima (`search(query) → ofertas`). El catálogo JSON estático es el proveedor base y siempre funciona offline.

## Modelo de datos

- `FurnitureModel`: medidas, sistema de unión, lista de `Panel` (con posición 3D y cantos), `HardwareItem`, `Material`.
- `Project` (`.handy.json`): metadatos, región, lista de muebles, espacio importado, ubicación geográfica para el estudio solar, catálogos usados y la cotización congelada con fecha.
- Todo en mm enteros; `grain` indica la dirección de la veta para el optimizador de corte.

## Interfaz: tres secciones

```
┌─────────────────────────────────────────────────────────────┐
│ Handy   [ Espacios ]   [ Muebles ]   [ Objetos ]   proyecto ▾│
├─────────────────────────────────────────────────────────────┤
│ Espacios: mapa 2D + vista 3D · muros con grosor · aberturas  │
│           puntos eléctricos y canalización probable · sol    │
│ Muebles:  parámetros + visor 3D · lista de corte · cotización│
│           avisos y esfuerzos · madera, tablero, ladrillo     │
│ Objetos:  pieza paramétrica · tolerancias · imprimibilidad   │
│           exportar STL/3MF                                   │
└─────────────────────────────────────────────────────────────┘
```

El navegador es la versión principal (PWA, funciona offline). El ejecutable agrega acceso a disco, API local para IAs y conversión de formatos pesados. La interfaz tiene **modo claro y oscuro** desde el primer día: los tokens de color viven en variables CSS, el tema sigue la preferencia del sistema y se puede forzar; el visor 3D ajusta fondo e iluminación sin alterar los colores de los materiales.

## Flujo típico

1. El usuario (o una IA vía MCP) describe el mueble → `generateCabinet()` y otros generadores producen el modelo.
2. `validateFurniture()` devuelve avisos con nivel y código.
3. `buildCutlist()` calcula piezas, cantos, m² y tableros estimados.
4. `buildQuote()` consulta los proveedores y arma la cotización con fecha y faltantes.
5. La UI renderiza el modelo en 3D (cada panel es una caja en su `placement`), permite arrastrar medidas y vuelve a correr 1–4 en tiempo real (es barato: ms).
6. `analyzeStructure()` evalúa flecha, tensión y pandeo con cargas típicas y colorea el modelo.
7. El proyecto se guarda como JSON; exportaciones a glTF/OBJ (Blender), PDF (planos y lista de corte), CSV, DXF, STL/3MF (objetos). Ver [modulos/exportacion.md](modulos/exportacion.md).
