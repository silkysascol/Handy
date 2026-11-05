# Módulo: IA y MCP

## Objetivo

Que cualquier IA (Claude Desktop, Claude Code, Cursor, agentes locales con Ollama/LM Studio) pueda diseñar, cotizar y modificar proyectos de Handy con herramientas tipadas y explicables.

## Hoy

`apps/mcp-server` expone por stdio:

| Herramienta | Entrada | Salida |
| --- | --- | --- |
| `design_cabinet` | medidas, repisas, puertas, zócalo, unión, espesor | modelo con posiciones 3D, avisos, lista de corte, cotización |
| `cutlist` | igual | lista de corte |
| `search_prices` | categoría, texto, espesor, acabado | ofertas de los proveedores configurados |

Variable `HANDY_CATALOG` para apuntar a un catálogo propio.

## Previsto

- `create_project`, `open_project`, `save_project`: trabajar sobre `.handy.json`.
- `add_furniture`, `modify_furniture` (comandos tipo "ensancha 100 mm"), `place_in_space`.
- `draw_space` (muros con grosor, aberturas), `import_space` (RoomPlan/glTF), `sun_study`, `electrical_points`, `infer_wiring`, `plumbing_route`.
- `analyze_structure`: flecha, tensión y pandeo con cargas típicas.
- `export` a glTF/OBJ/STL/3MF/DXF/PDF.
- `suggest_improvements`: devuelve propuestas estéticas y constructivas con justificación.
- `generate_part`: pieza imprimible a medida, STL/3MF.
- Recursos MCP: catálogos, normativas por país, proyecto actual.
- Transporte HTTP (Streamable HTTP) desde el ejecutable, además de stdio.
- Esquema OpenAPI equivalente para IAs sin MCP; puente para tool calling de Ollama.

## Diseño de las herramientas

- Entradas en mm enteros, validadas con zod; errores claros en español.
- Salidas con `content` resumido para el modelo y `structuredContent` completo para la UI.
- Ninguna herramienta hace cambios destructivos sin un `confirm: true` explícito (borrar proyecto, sobrescribir).
- Cada aviso lleva `code` estable para que la IA pueda razonar y proponer la corrección.
