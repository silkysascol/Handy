# Roadmap

Fases cortas, cada una entrega algo usable. Las fechas son orientativas.

## M0 · Fundaciones (hecho)

- [x] Monorepo pnpm, CI, licencia MIT.
- [x] `@handy/core`: modelo en mm, generador de gabinete, lista de corte, reglas básicas, cotización con catálogo JSON.
- [x] CLI y servidor MCP con `design_cabinet`, `cutlist`, `search_prices`, `check_collisions`.
- [x] `MotionSpec` en piezas móviles y comprobador de colisiones nivel 1 (cajas envolventes, obstáculos externos).
- [x] Documentos de visión, arquitectura y módulos.

> Reordenado el 2026-11-07 tras el council (ver `docs/investigacion/council-presupuesto-y-monetizacion.md`): el paquete para talleres va antes que el editor web completo y la IA de presupuesto espera a tener talleres pagando.

## M1 · Motor de muebles completo y paquete para talleres

- [ ] Generadores: cajonera (correderas, frentes), escritorio, módulo de cocina bajo y alto, closet con divisiones, biblioteca.
- [ ] Sistema 32 mm: perforaciones para repisas y bisagras calculadas y exportadas.
- [ ] Cinemática por herraje: `MotionSpec` en cada pieza móvil (giro, traslación, abatible), catálogo de herrajes con ficha de movimiento; colisiones nivel 2 (OBB, obstáculos desde Espacios y electrodomésticos).
- [ ] Modo "sin tornillos a la vista" como opción del mueble.
- [ ] `packages/hardware`: herrajes genéricos paramétricos con ficha de movimiento; importación opcional de STEP (Hettich, Häfele).
- [ ] `packages/assembly`: plan de ensamblaje automático desde juntas y herrajes.
- [ ] Optimizador de corte (nesting) con veta y sierra de 3–4 mm; plano de corte por tablero.
- [ ] Exportación: CSV y PDF de lista de corte, JSON del proyecto.
- [ ] Cotización por proyecto (varios muebles, desperdicio consolidado) con **precios propios del taller** ingresados a mano, fecha de cada precio y tolerancia visibles.
- [ ] PDF de cotización con marca del taller, renglones editables de mano de obra, mesón, instalación e imprevistos; historial de versiones.
- [ ] `fit_to_budget` determinista: degradaciones ordenadas y deltas explicables.
- [ ] Todo lo anterior disponible por MCP y CLI antes que en la web; vender en persona a 10 talleres y conseguir 5 compromisos de pago.
- [ ] Esfuerzos nivel 1: flecha y tensión de repisas y cubiertas, pandeo de costados, con cargas típicas.
- [ ] Exportación glTF/OBJ del mueble para Blender.
- [ ] Catálogos reales de al menos 2 países (comunidad).

## M2 · App web (versión principal)

- [ ] Menú de tres secciones: Espacios, Muebles, Objetos.
- [ ] Tema claro y oscuro con tokens CSS; sigue al sistema y se puede forzar.
- [ ] Espacios: editor de mapa 2D con muros de grosor configurable, puertas, ventanas, recintos; vista 3D.

- [ ] Visor 3D (react-three-fiber), piezas desde `placement`, animación de apertura por pieza.
- [ ] Precio total en la esquina del visor con resumen al pasar el mouse; paneles plegables estilo Blender.
- [ ] Selección por pieza y módulo, comandos acotados a la selección, vista aislada (`/`) y sección.
- [ ] Instrucciones de armado: render de líneas, PDF sin texto y HTML animado.
- [ ] Edición por arrastre de medidas (gizmos en caras) y panel de parámetros.
- [ ] Cotización en vivo en el lateral, con tienda, fecha y faltantes.
- [ ] Comandos en lenguaje natural ("ensancha 10 cm", "agrega una repisa") resueltos localmente o vía IA.
- [ ] Guardar/abrir `.handy.json`; PWA para uso offline.

## M3 · Escritorio (Tauri) e IA local

- [ ] Ejecutable Windows/macOS/Linux con la web embebida.
- [ ] API HTTP local (OpenAPI) + MCP por stdio y HTTP; detección automática por Claude Desktop/Claude Code.
- [ ] Puente para IAs locales (Ollama, LM Studio) con tool calling sobre el mismo esquema.

## M4 · Espacios avanzado (LiDAR y eléctrica)

- [ ] Puntos eléctricos con alturas por país e inferencia de canalización y circuitos con nivel de confianza.

- [ ] Importar RoomPlan JSON/USDZ, glTF, OBJ, PLY; detectar paredes, puertas, ventanas, enchufes si vienen.
- [ ] Colocar muebles en el espacio con snapping a paredes y detección de colisión con puertas/ventanas.
- [ ] Vista "proyección": medidas del mueble se adaptan al hueco disponible.

## M5 · Arquitectura y estructura

- [ ] Electrodomésticos: biblioteca con medidas y conexiones, comando de reemplazo, servicios del mueble (desagüe, agua, gas, tomas) e iluminación integrada con recorrido de cable.
- [ ] Esfuerzos nivel 2: método de rigidez para muebles completos, mapa de color; nivel 3 preliminar para luces y aberturas en espacios.
- [ ] Muebles de ladrillo: generador de asador, aparejos, conteo de ladrillos y mortero, cotización.

- [ ] Estudio solar: posición del sol, sombras en el visor, horas de sol directo por fachada y ventana, diagrama anual.
- [ ] Capa eléctrica: alturas estándar de enchufes/interruptores por país, distancias a agua, conteo de puntos.
- [ ] Capa sanitaria: diámetros y pendientes de desagüe, trazado con avisos de pendiente insuficiente.

## M6 · Asistente de diseño y Objetos

- [ ] Colorimetría: paletas armónicas a partir del decorado del tablero y colores de la habitación; vista previa con texturas.
- [ ] Propuestas constructivas: cambiar a uniones ocultas, añadir refuerzos, dividir puertas, ajustar proporciones.
- [ ] Biblioteca de repuestos paramétricos imprimibles (soportes, tapas, patas, clips, tiradores) con export STL/3MF y tolerancias.
- [ ] Generación de repuestos desde el modelo del mueble (p.ej. tapa a medida para un herraje).
- [ ] Add-on de Blender para importar `.handy.json`; exportación IFC.

## M7 · "Diseña con mi presupuesto" (cuando haya talleres pagando)

Con el espacio creado, el usuario fija un presupuesto y la IA propone tres variantes coherentes, cotizadas y verificadas. Diseño completo en `docs/investigacion/council-presupuesto-y-monetizacion.md`. Depende de que la cotización por proyecto y `fit_to_budget` de M1 ya estén en uso real.

- [ ] Caché de precios de 24 h y búsqueda por texto en `quote_project`; nesting por formato de tablero.
- [ ] Generador de cocina por módulos estándar y `layout_kitchen` sobre tramos libres del espacio.
- [ ] `get_space_context` desde `packages/spaces`; obstáculos automáticos para colisiones.
- [ ] Lista negra en el motor (muros, bajantes, gas, tablero) y supuestos declarados por propuesta.
- [ ] Contrato anti-alucinación en el MCP (cifras citadas por SKU) y conjunto de evaluación con 20–30 proyectos.
- [ ] Trazabilidad en `.handy.json`: qué calculó el motor y qué dijo la IA; historial de versiones de cotización.
- [ ] Modo taller: precios propios, tarifa por módulo, margen; el cliente final no ve el costo desnudo.

## Más adelante

- Realidad aumentada en el teléfono para ver el mueble en el espacio.
- Marketplace comunitario de catálogos y modelos.
- Integración con cortadoras CNC (G-code/DXF por pieza).
