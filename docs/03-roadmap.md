# Roadmap

> **Fase actual: herramienta personal.** Handy se construye para los trabajos de su autor y se prueba en ellos. El orden de abajo es una propuesta; lo que manda es el siguiente proyecto real. Todo lo comercial (planes, afiliados, plantilla física, leads) está **aparcado** hasta haber terminado varios proyectos propios con Handy; el análisis queda guardado en `docs/investigacion/council-presupuesto-y-monetizacion.md`.

Fases cortas, cada una entrega algo usable. Las fechas son orientativas.

## M0 · Fundaciones (hecho)

- [x] Monorepo pnpm, CI, licencia MIT.
- [x] `@handy/core`: modelo en mm, generador de gabinete, lista de corte, reglas básicas, cotización con catálogo JSON.
- [x] CLI y servidor MCP con `design_cabinet`, `cutlist`, `search_prices`, `check_collisions` y las herramientas `world_*`.
- [x] `MotionSpec` en piezas móviles y comprobador de colisiones nivel 1 (cajas envolventes, obstáculos externos).
- [x] Documentos de visión, arquitectura y módulos.

> Reordenado el 2026-11-07 tras el council con la visión correcta (ver `docs/investigacion/council-presupuesto-y-monetizacion.md`): Handy es para quien lo hace él mismo. El primer producto es un solo flujo completo, "mi primer closet", validado con personas reales antes de ampliar a cocina, pisos e IA de presupuesto.

## M1 · "Mi casa en Handy": el mundo primero

El centro de Handy es el duplicado virtual de los espacios del autor, sobre el que él y su IA planifican. Primera versión hecha; lo que sigue se decide con el uso real.

- [x] Modelo del mundo (`*.world.json`): habitaciones rectangulares con grosor por muro, puertas, ventanas y pasos; gabinetes colocados contra un muro, apoyados o colgados.
- [x] Consultas para la IA: descripción del mundo en texto, tramos libres por muro según la altura del mueble.
- [x] Revisión del mundo: solapes, puertas y ventanas tapadas, colisiones al abrir contra muros y muebles vecinos, reglas de cada mueble.
- [x] Cotización consolidada de todos los muebles del mundo.
- [x] Exportación glTF para Blender (validada con el validador de Khronos): jerarquía por habitación, muro y pieza; medidas en `extras`.
- [x] Herramientas MCP `world_*` para que la IA cree, consulte, coloque, revise, cotice y exporte.
- [x] Intérprete de órdenes en español acotado a la selección (`runCommand`) y funciones para modificar habitaciones, aberturas y muebles con validación.
- [x] Visor web: clic para seleccionar muro, abertura, mueble o habitación; barra de órdenes; precio en la esquina; avisos; deshacer; importar y exportar; tema claro y oscuro; actualización en vivo cuando la IA cambia el mundo.
- [x] Pruebas de navegador en el repo (`pnpm e2e`): 12 casos de extremo a extremo con servidor y mundo temporales. `pnpm check` corre todo.
- [x] Plano de corte real: piezas acomodadas en tableros con ancho de disco, refilado y veta; despiece imprimible y CSV para la tienda (botón Despiece, `world_cutplan`). La cotización usa esos tableros, no un porcentaje.
- [x] Pisos: baldosas dibujadas en la habitación, piezas enteras y cortes, cajas según la tienda, pega por formato y material, boquilla, guardaescobas; sumado al precio del mundo (`world_floor_plan`).
- [ ] **Cargar la casa real del autor** y anotar lo que falte.
- [ ] Habitaciones no rectangulares (polígonos), niveles y puertas entre habitaciones; importar RoomPlan/LiDAR.
- [ ] Arrastrar con el mouse para mover y estirar, además de las órdenes; cotas visibles en la vista; muebles sueltos no pegados a un muro.
- [ ] Más vocabulario en el intérprete según lo que el autor escriba y no se entienda (registro de órdenes no entendidas).
- [ ] Más cosas que colocar: closet con divisiones, cajonera, marcos de tubo, piso con despiece.
- [ ] Despiece lineal de perfiles de acero; validar el despiece de tableros con el operario de la tienda.

## M1a · "Mi primer mueble": un flujo completo

- [ ] Generadores: closet con divisiones y barra, estantería/biblioteca; cajonera después.
- [ ] Sistema de unión según herramientas del usuario: minifix con perforación en la tienda (exportar archivo de perforado), minifix o tarugos con plantilla imprimible (Objetos), encaje sin perforar. "Sin tornillos a la vista" predeterminado.
- [ ] Despiece en el **formato exacto** que reciben Madecentro y Homecenter (veta, cantos por lado, tolerancias): ir a la tienda y validarlo con el operario de la sierra antes de más 3D.
- [ ] Presupuesto completo: tableros enteros por formato, cantos, herrajes, reserva, con tienda y fecha visibles; renglones editables para lo que el motor no cotiza.
- [ ] Instrucciones de armado en PDF sin texto (plan de ensamblaje automático, render de líneas).
- [ ] Web mínima que conecta lo anterior: medidas → diseño → despiece → presupuesto → PDF. Tema claro y oscuro con tokens.
- [ ] Validación dura: sin validación verde del motor no hay lista de corte; la IA (del usuario, por MCP) elige entre opciones válidas y nunca inventa medidas.
- [ ] Prueba real: el autor diseña, manda a cortar y arma un mueble propio con Handy de principio a fin, y anota cada fricción. Después, otras personas.
- [ ] Sistema 32 mm, exportación CSV, `MotionSpec` por herraje (parte hecha), catálogos reales de 2 países.

## M1b · Perfiles de acero y similares

Ver `docs/modulos/metal.md`. Se adelanta o atrasa según el primer proyecto propio que lo necesite.

- [ ] Catálogo de perfiles (tubo cuadrado y rectangular, ángulo, platina, aluminio ranurado, perfilería de drywall) con peso por metro y largo comercial.
- [ ] Generadores: marco, base de mesa, estantería de marcos, bastidor de drywall.
- [ ] Despiece lineal de barras de 6 m con ancho de disco e ingletes; peso, barras a comprar y consumibles.
- [ ] Uniones según habilidad: soldado, atornillado con conectores, o plano para el cerrajero.
- [ ] Mixto madera y metal en un mismo mueble y una misma cotización.

## M2 · Editor completo y cocina

- [ ] Generador de cocina por módulos estándar con mesón, servicios (desagüe, agua, gas, tomas) y electrodomésticos.
- [ ] Asistente de decisiones: cajón vs tapa con pistón, 15 vs 18 mm, telescópica vs oculta, con precio y movimiento de cada opción.

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

## M5 · Arquitectura, pisos y estructura

- [ ] Pisos, segunda parte: diagonal y espina de pez, plano numerado de cortes, enchape de paredes, laminado y vinílico, comparación cerámica vs porcelanato (ver `docs/modulos/pisos.md`).

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

## M7 · "Diseña con mi presupuesto" (cuando 50 personas hayan terminado un mueble)

Con el espacio creado, el usuario fija un presupuesto y la IA propone tres variantes coherentes, cotizadas y verificadas. Diseño completo en `docs/investigacion/council-presupuesto-y-monetizacion.md`. Depende de que la cotización por proyecto y el flujo de closet de M1 ya estén en uso real.

- [ ] Caché de precios de 24 h y búsqueda por texto en `quote_project`; nesting por formato de tablero.
- [ ] Generador de cocina por módulos estándar y `layout_kitchen` sobre tramos libres del espacio.
- [ ] `get_space_context` desde `packages/spaces`; obstáculos automáticos para colisiones.
- [ ] Lista negra en el motor (muros, bajantes, gas, tablero) y supuestos declarados por propuesta.
- [ ] Contrato anti-alucinación en el MCP (cifras citadas por SKU) y conjunto de evaluación con 20–30 proyectos.
- [ ] Trazabilidad en `.handy.json`: qué calculó el motor y qué dijo la IA; historial de versiones de cotización.
- [ ] Modo taller (mercado secundario): precios propios, tarifa por módulo, margen; el cliente final no ve el costo desnudo.

## Más adelante

- Realidad aumentada en el teléfono para ver el mueble en el espacio.
- Marketplace comunitario de catálogos y modelos.
- Integración con cortadoras CNC (G-code/DXF por pieza).
