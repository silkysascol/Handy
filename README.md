# Handy

**Handy** es una herramienta open source para diseñar muebles, piezas imprimibles en 3D y resolver detalles de arquitectura doméstica, con **cotización aproximada en tiempo real** usando precios de tiendas locales y una interfaz pensada para que **Claude y otras IAs** puedan usarla como copiloto.

> Estado: **pre-alpha / planificación**. El motor (`@handy/core`) y el servidor MCP ya funcionan por línea de comandos. La app web y el ejecutable de escritorio están en diseño. Ver [docs/03-roadmap.md](docs/03-roadmap.md).

## Qué va a hacer Handy

| Módulo | Qué resuelve |
| --- | --- |
| **Muebles** | Diseño paramétrico de gabinetes, closets, cocinas, bibliotecas y escritorios en melamina u otros tableros. Lista de corte, enchapado de cantos, herrajes y plano de armado. |
| **Cotización** | Busca melaminas, herrajes y otros materiales en tiendas locales (o en catálogos propios) y actualiza el precio mientras diseñas. |
| **Asistente de diseño** | Propone mejoras estéticas (colorimetría, texturas, proporciones) y constructivas (uniones sin tornillos visibles, refuerzos, holguras). |
| **Espacios** | Importa habitaciones escaneadas con el LiDAR del iPhone (RoomPlan, Polycam, 3D Scanner App) y permite ubicar y estirar muebles en el espacio real arrastrando o con comandos. |
| **Arquitectura** | Alturas estándar de enchufes e interruptores, reglas de tuberías y desagües, y estudio de luz solar según orientación, ubicación y fecha. |
| **Impresión 3D** | Biblioteca paramétrica de repuestos y accesorios (soportes de repisa, tapas, patas, clips, tiradores) exportable a STL/3MF. |
| **IA / MCP** | Servidor [MCP](https://modelcontextprotocol.io) para que Claude, Claude Code, Cursor, Ollama u otras IAs del PC diseñen, coticen y modifiquen proyectos. |

Lee la visión completa en [docs/01-vision.md](docs/01-vision.md) y la arquitectura en [docs/02-arquitectura.md](docs/02-arquitectura.md).

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

Obtienes la lista de corte, los m² y tableros necesarios, avisos de diseño (pandeo de repisas, puertas demasiado anchas, uniones visibles) y una cotización con el catálogo de ejemplo. Agrega `--json` para obtener el modelo completo con posiciones 3D de cada pieza.

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

Herramientas expuestas hoy: `design_cabinet`, `cutlist`, `search_prices`. Ver [docs/modulos/ia-mcp.md](docs/modulos/ia-mcp.md).

### Usar tus precios locales

Copia `packages/core/data/catalog-ejemplo.json`, pon los precios de tu ferretería o distribuidor de tableros y pásalo con `--catalog` o la variable `HANDY_CATALOG`. Los adaptadores a tiendas reales se describen en [docs/modulos/cotizacion.md](docs/modulos/cotizacion.md).

## Estructura del repositorio

```
Handy/
├── packages/core/        Motor: modelo, generadores, lista de corte, validaciones, cotización
├── apps/mcp-server/      Servidor MCP (stdio) para IAs
├── apps/web/             App web (React + Three.js)            [en diseño]
├── apps/desktop/         Ejecutable (Tauri) que empaqueta la web + API local  [en diseño]
└── docs/                 Visión, arquitectura, roadmap, módulos, decisiones (ADR), ejemplos
```

## Contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md). Los primeros temas abiertos están en el [roadmap](docs/03-roadmap.md) y en cada documento de módulo bajo "Preguntas abiertas". Especialmente útiles: catálogos de precios por país, medidas estándar y normativas locales, y modelos de repuestos imprimibles.

## Licencia

MIT. Ver [LICENSE](LICENSE).
