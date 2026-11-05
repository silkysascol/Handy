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
| `packages/spaces` | Importación de habitaciones (RoomPlan JSON, USDZ, glTF, OBJ, PLY), paredes, puertas, ventanas, colisiones. | Planificado |
| `packages/arch` | Sol (posición solar, sombras, horas de sol por fachada), estándares eléctricos y sanitarios por país. | Planificado |
| `packages/parts` | Piezas paramétricas imprimibles y exportación STL/3MF. | Planificado |
| `packages/providers-*` | Adaptadores de tiendas por país (`providers-cl`, `providers-co`, ...). | Planificado |
| `apps/web` | Editor 3D en navegador. | Diseño |
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

## Flujo típico

1. El usuario (o una IA vía MCP) describe el mueble → `generateCabinet()` y otros generadores producen el modelo.
2. `validateFurniture()` devuelve avisos con nivel y código.
3. `buildCutlist()` calcula piezas, cantos, m² y tableros estimados.
4. `buildQuote()` consulta los proveedores y arma la cotización con fecha y faltantes.
5. La UI renderiza el modelo en 3D (cada panel es una caja en su `placement`), permite arrastrar medidas y vuelve a correr 1–4 en tiempo real (es barato: ms).
6. El proyecto se guarda como JSON; exportaciones a PDF (planos y lista de corte), CSV (lista para el aserradero), DXF (optimización de corte), STL/3MF (repuestos).
