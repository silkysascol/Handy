# Módulo: IA y MCP

## Objetivo

Que cualquier IA (Claude Desktop, Claude Code, Cursor, agentes locales con Ollama/LM Studio) pueda diseñar, cotizar y modificar proyectos de Handy con herramientas tipadas y explicables.

## Hoy

`apps/mcp-server` expone por stdio:

| Herramienta | Entrada | Salida |
| --- | --- | --- |
| `design_cabinet` | medidas, repisas, puertas, zócalo, unión, espesor, obstáculos opcionales | modelo con posiciones 3D, avisos, colisiones, lista de corte, cotización |
| `cutlist` | igual | lista de corte |
| `search_prices` | categoría, texto, espesor, acabado | ofertas de los proveedores configurados |
| `check_collisions` | gabinete + obstáculos (cajas con nombre) | choques al abrir puertas y cajones, con ángulo o recorrido |

Variable `HANDY_CATALOG` para apuntar a un catálogo propio. Los precios propios del usuario viven en `precios.json` junto al mundo, o donde indique `HANDY_PRICES`.

Flujo de precios reales: `prices_needed` → la IA busca cada renglón en las tiendas del usuario con sus propias herramientas de búsqueda → `price_set` con tienda y enlace → `world_quote`. La IA solo anota precios que vio en la página de la tienda o que el usuario le dio; nunca estimados.

### Herramientas del mundo

El mundo vive en `~/.handy/mundo.world.json` o donde indique `HANDY_WORLD`. La IA debe llamar a `world_describe` antes de proponer algo.

| Herramienta | Qué hace |
| --- | --- |
| `world_create` | Crea el mundo. No sobrescribe uno existente sin `overwrite: true`. |
| `world_describe` | Estado completo en texto: habitaciones, muros, aberturas, muebles y tramos libres. |
| `world_add_room` | Habitación rectangular, suelta o pegada a otra con `attachTo` y `side` (comparten muro). |
| `world_add_opening` | Puerta, ventana o paso en un muro. |
| `world_free_runs` | Tramos de muro donde cabe un mueble de cierta altura. |
| `world_place_cabinet` | Coloca un gabinete contra un muro y devuelve los avisos que provoca. |
| `world_place_frame` | Coloca una mesa o estantería de tubo cuadrado; devuelve barras de 6 m, peso y avisos. |
| `world_update_item` | Cambia medidas, posición o partes de un mueble; valida que quepa. |
| `world_command` | Aplica una orden corta en español sobre una selección, igual que la barra del visor. |
| `world_remove_item` | Quita un mueble. |
| `world_check` | Revisa todo: solapes, aberturas tapadas, colisiones al abrir, reglas constructivas. |
| `world_quote` | Cotización de todo el mundo: muebles (tableros según plano de corte) y pisos. |
| `world_cutplan` | Acomoda las piezas en tableros y escribe el despiece imprimible y el CSV. |
| `world_assembly` | Pasos de armado de un mueble en tres niveles (`guided`, `normal`, `expert`), con acciones, medidas de cada herraje y comprobaciones; escribe el manual imprimible. |
| `world_drilling` | Plano de perforación por pieza: herraje, diámetro, profundidad, cara o canto y distancias a los bordes. |
| `prices_needed` | Renglones del presupuesto con su clave y el precio que tienen hoy: falta, viejo o al día. Es la lista de compras que la IA debe ir a buscar. |
| `price_set` | Anota un precio visto en una tienda (nombre, tienda, valor, presentación, enlace, fecha) para la clave de un renglón. |
| `price_list`, `price_remove` | Ver y borrar precios anotados. |
| `world_floor_plan` | Cálculo del piso de una habitación: piezas, cajas, pega, boquilla, avisos. |
| `world_export_gltf` | Escribe el `.gltf` para Blender. |

## Previsto

- `create_project`, `open_project`, `save_project`: trabajar sobre `.handy.json`.
- `add_furniture`, `modify_furniture` (comandos tipo "ensancha 100 mm"), `place_in_space`.
- `draw_space` (muros con grosor, aberturas), `import_space` (RoomPlan/glTF), `sun_study`, `electrical_points`, `infer_wiring`, `plumbing_route`.
- `search_hardware`: herrajes compatibles con una pieza (medida, carga, tipo) en las tiendas configuradas, con la ficha de movimiento.
- `set_motion`: fija el herraje y el movimiento de una pieza; `simulate_motion` anima y devuelve colisiones.
- `place_appliance`: reemplaza un módulo por un electrodoméstico (modelo o sugerido) y recalcula hueco, servicios y precio.
- `services`: alturas de desagüe, agua, gas y tomas para un módulo según reglas del país.
- `route_cable`: recorrido de cable para iluminación integrada.
- `set_hidden_fasteners`: activa el ensamble sin tornillos a la vista.
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
