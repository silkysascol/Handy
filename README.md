# Handy

**Handy** es una herramienta open source para la persona que hace las cosas por sí misma: diseña tu cocina, tu closet o tu piso, manda a cortar en la tienda y ármalo en casa como un mueble de IKEA, sin tornillos a la vista ni perforaciones milimétricas. Calcula cuánto te va a costar con **precios de tiendas cercanas en tiempo real** y conecta **tu propia IA** (Claude, ChatGPT o un modelo local) para que te ayude a diseñar y decidir.

> Estado: **pre-alpha / planificación**. El motor (`@handy/core`) y el servidor MCP ya funcionan por línea de comandos. La app web y el ejecutable de escritorio están en diseño. Ver [docs/03-roadmap.md](docs/03-roadmap.md).

## La idea

Prototipos **rápidos y fieles** a lo que quieres, hechos en el navegador o en el ejecutable, que salen sin fricción a Blender y otros programas profesionales para presentarlos o fabricarlos. Un menú de tres secciones:

| Sección | Enfoque | Qué resuelve |
| --- | --- | --- |
| **Espacios** | interfaz y medidas de apartamentos, cuartos y casas | Dibujar el mapa del lugar con grosor de muros, puertas y ventanas; importar escaneos LiDAR del iPhone; **pisos**: despiece de cerámica o porcelanato, cajas, pega y boquilla; puntos eléctricos con inferencia de canalización; reglas de tuberías; estudio de luz solar. |
| **Muebles** | interfaz y medidas de muebles de madera, tablero, ladrillo y perfiles de acero | Gabinetes, closets, cocinas, escritorios en melamina; asadores y mesones de ladrillo. Sistema de unión según tus herramientas (perforación en la tienda o plantilla impresa), lista de corte, herrajes con su movimiento, cotización en tiempo real, decisiones como cajón o tapa con pistón, e instrucciones de armado. |
| **Objetos** | cosas pequeñas | Repuestos, accesorios y **plantillas de perforado** paramétricos, listos para imprimir en 3D en STL/3MF. |

Transversal a las tres: **simulación de esfuerzos** para saber si una repisa, un asador o un espacio aguanta la carga, **cotización** con precios locales, **exportación** a glTF/OBJ/STL/DXF/PDF, y un servidor [MCP](https://modelcontextprotocol.io) para que Claude, Claude Code, Cursor, Ollama u otras IAs del PC diseñen y coticen contigo.

Lee la visión en [docs/01-vision.md](docs/01-vision.md), la arquitectura en [docs/02-arquitectura.md](docs/02-arquitectura.md) y cada sección en [docs/modulos/](docs/modulos/).

## Prueba lo que ya existe

Requisitos: Node 20+ y pnpm 10+.

```bash
pnpm install
pnpm build
pnpm test
```

Diseña un armario de 800 x 2000 x 500 mm con 3 repisas, 2 puertas y zócalo, unido con minifix (sin tornillos visibles):

```bash
pnpm cli cabinet --width 800 --height 2000 --depth 500 --shelves 3 --doors 2 --plinth 80 --joinery minifix
```

Obtienes la lista de corte, los m² y tableros necesarios, avisos de diseño (pandeo de repisas, puertas demasiado anchas, uniones visibles) y una cotización con el catálogo de ejemplo. Añade `--wall-left` para simular un muro pegado al mueble y ver si la puerta choca al abrir. Agrega `--json` para obtener el modelo completo con posiciones 3D de cada pieza.

### Conectar Handy a Claude (MCP)

```bash
pnpm mcp
```

Configuración para Claude Desktop o Claude Code (`claude mcp add handy -- pnpm --dir /ruta/a/Handy mcp`):

```json
{
  "mcpServers": {
    "handy": {
      "command": "pnpm",
      "args": ["--dir", "/ruta/a/Handy", "mcp"],
      "env": { "HANDY_CATALOG": "/ruta/a/mi-catalogo.json" }
    }
  }
}
```

Herramientas expuestas hoy: `design_cabinet`, `cutlist`, `search_prices`, `check_collisions`. Ver [docs/modulos/ia-mcp.md](docs/modulos/ia-mcp.md).

### Usar tus precios locales

Copia `packages/core/data/catalog-ejemplo.json`, pon los precios de tu ferretería o distribuidor de tableros y pásalo con `--catalog` o la variable `HANDY_CATALOG`. Los adaptadores a tiendas reales se describen en [docs/modulos/cotizacion.md](docs/modulos/cotizacion.md).

## Estructura del repositorio

```
Handy/
├── packages/core/        Motor: modelo, generadores, lista de corte, validaciones, cotización
├── apps/mcp-server/      Servidor MCP (stdio) para IAs
├── apps/web/             App web (React + Three.js)            [en diseño]
├── apps/desktop/         Ejecutable (Tauri) que empaqueta la web + API local  [en diseño]
└── docs/                 Visión, arquitectura, roadmap, módulos, decisiones (ADR), ejemplos, mocks de UI
```

## Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md). Los primeros temas abiertos están en el [roadmap](docs/03-roadmap.md) y en cada documento de módulo bajo "Preguntas abiertas". Especialmente útiles: catálogos de precios por país, medidas estándar y normativas locales, y modelos de repuestos imprimibles.

## Licencia

MIT. Ver [LICENSE](LICENSE).
