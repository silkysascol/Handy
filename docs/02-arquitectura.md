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

## El mundo es el centro

Todo gira alrededor de un archivo: `*.world.json`, el duplicado virtual de los espacios del usuario. Contiene habitaciones (medidas, grosor de cada muro, puertas, ventanas, pasos) y lo que hay dentro (muebles con sus parámetros y su posición contra un muro). Las interfaces no guardan estado propio: la web, el ejecutable, la CLI y la IA por MCP leen y escriben ese mismo mundo.

```
        tú (web / ejecutable)            tu IA (MCP)
                 │                            │
                 ▼                            ▼
        ┌──────────────────────────────────────────┐
        │   mundo  (mi-casa.world.json)            │
        │   habitaciones · muros · aberturas       │
        │   muebles colocados · pisos · estructuras│
        └───────────────┬──────────────────────────┘
                        │  @handy/core: describir, tramos libres, colocar,
                        │  revisar (colisiones, aberturas, solapes), cotizar
          ┌─────────────┼──────────────┬───────────────┐
          ▼             ▼              ▼               ▼
      glTF → Blender   despiece     lista de compras  instrucciones
      (renders)        madera/metal  con precios       de armado
```

Implementado hoy en `packages/core/src/world.ts` y `gltf.ts`: habitaciones rectangulares, aberturas, gabinetes contra un muro (apoyados o colgados), `describeWorld` (texto para la IA), `freeWallRuns`, `checkWorld`, cotización consolidada y exportación glTF validada. Ejes del mundo: X derecha, Y arriba, Z hacia el observador; milímetros enteros; los offsets se miden desde el extremo izquierdo del muro mirándolo desde dentro.

## Seleccionar y ordenar

La interacción base es **selección + orden en lenguaje natural**. La selección (`Selection`: mundo, habitación, muro, abertura o mueble) acota la orden. `runCommand(world, selection, text)` en `packages/core/src/commands.ts` es un intérprete determinista en español: entiende medidas con o sin unidad, "a X de la izquierda/derecha", "centrada", medidas relativas ("ensancha", "más bajo") y absolutas, cantidades ("2 puertas", "agrega una repisa") y borrado. Devuelve `ok`, `understood`, un mensaje que repite lo interpretado en mm y qué dejar seleccionado. Toda mutación pasa por funciones del mundo que validan y no dejan nada a medias. Si `understood` es falso, la interfaz ofrece la orden lista para la IA; la misma capacidad está en MCP como `world_command`.

El visor (`apps/web`) es three.js sin framework: construye la escena desde el mundo, selecciona con clic (los muros entre la cámara y la habitación se atenúan y no interceptan el clic), muestra el precio en la esquina y guarda en el archivo del mundo a través de un servidor local mínimo que también avisa de cambios externos por SSE.

## Paquetes

| Paquete | Rol | Estado |
| --- | --- | --- |
| `packages/core` | Motor puro, sin dependencias de UI. Todo lo que calcula Handy vive aquí. | Funcional (gabinete, corte, reglas, cotización) |
| `packages/spaces` | Editor de mapa (muros con grosor, aberturas, niveles, recintos), importación de escaneos (RoomPlan JSON, USDZ, glTF, OBJ, PLY), puntos eléctricos e inferencia de canalización, colisiones. | Planificado |
| `packages/arch` | Sol (posición solar, sombras, horas de sol por fachada), estándares eléctricos y sanitarios por país. | Planificado |
| `packages/objects` | Piezas paramétricas imprimibles (CSG con manifold-3d). | Planificado |
| `packages/structure` | Simulación de esfuerzos: analítico y método de rigidez; propiedades de materiales. | Planificado |
| `packages/export` | glTF/GLB, OBJ, STL/3MF, DXF/SVG, PDF, CSV; más adelante IFC y USDZ. | Planificado |
| `packages/hardware` | Herrajes genéricos paramétricos (geometría simple + `MotionSpec`), mapeo tienda → genérico, importación STEP opcional. | Planificado |
| `packages/assembly` | Plan de ensamblaje automático y render de instrucciones (líneas, PDF, HTML). | Planificado |
| `packages/masonry` | Muebles de ladrillo (asador, mesón): aparejos, conteo de ladrillos y mortero. | Planificado |
| `packages/providers-*` | Adaptadores de tiendas por país (`providers-cl`, `providers-co`, ...). | Planificado |
| `apps/web` | Visor del mundo en navegador: clic para seleccionar, comandos en español, precio en la esquina, deshacer, tema claro y oscuro, exportar a Blender. | Funcional (primera versión) |
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
