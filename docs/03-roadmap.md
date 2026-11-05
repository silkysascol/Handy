# Roadmap

Fases cortas, cada una entrega algo usable. Las fechas son orientativas.

## M0 · Fundaciones (hecho)

- [x] Monorepo pnpm, CI, licencia MIT.
- [x] `@handy/core`: modelo en mm, generador de gabinete, lista de corte, reglas básicas, cotización con catálogo JSON.
- [x] CLI y servidor MCP con `design_cabinet`, `cutlist`, `search_prices`.
- [x] Documentos de visión, arquitectura y módulos.

## M1 · Motor de muebles completo

- [ ] Generadores: cajonera (correderas, frentes), escritorio, módulo de cocina bajo y alto, closet con divisiones, biblioteca.
- [ ] Sistema 32 mm: perforaciones para repisas y bisagras calculadas y exportadas.
- [ ] Optimizador de corte (nesting) con veta y sierra de 3–4 mm; plano de corte por tablero.
- [ ] Exportación: CSV y PDF de lista de corte, JSON del proyecto.
- [ ] Catálogos reales de al menos 2 países (comunidad).

## M2 · App web

- [ ] Visor 3D (react-three-fiber), piezas desde `placement`.
- [ ] Edición por arrastre de medidas (gizmos en caras) y panel de parámetros.
- [ ] Cotización en vivo en el lateral, con tienda, fecha y faltantes.
- [ ] Comandos en lenguaje natural ("ensancha 10 cm", "agrega una repisa") resueltos localmente o vía IA.
- [ ] Guardar/abrir `.handy.json`; PWA para uso offline.

## M3 · Escritorio (Tauri) e IA local

- [ ] Ejecutable Windows/macOS/Linux con la web embebida.
- [ ] API HTTP local (OpenAPI) + MCP por stdio y HTTP; detección automática por Claude Desktop/Claude Code.
- [ ] Puente para IAs locales (Ollama, LM Studio) con tool calling sobre el mismo esquema.

## M4 · Espacios (LiDAR)

- [ ] Importar RoomPlan JSON/USDZ, glTF, OBJ, PLY; detectar paredes, puertas, ventanas, enchufes si vienen.
- [ ] Colocar muebles en el espacio con snapping a paredes y detección de colisión con puertas/ventanas.
- [ ] Vista "proyección": medidas del mueble se adaptan al hueco disponible.

## M5 · Arquitectura

- [ ] Estudio solar: posición del sol, sombras en el visor, horas de sol directo por fachada y ventana, diagrama anual.
- [ ] Capa eléctrica: alturas estándar de enchufes/interruptores por país, distancias a agua, conteo de puntos.
- [ ] Capa sanitaria: diámetros y pendientes de desagüe, trazado con avisos de pendiente insuficiente.

## M6 · Asistente de diseño e impresión 3D

- [ ] Colorimetría: paletas armónicas a partir del decorado del tablero y colores de la habitación; vista previa con texturas.
- [ ] Propuestas constructivas: cambiar a uniones ocultas, añadir refuerzos, dividir puertas, ajustar proporciones.
- [ ] Biblioteca de repuestos paramétricos imprimibles (soportes, tapas, patas, clips, tiradores) con export STL/3MF y tolerancias.
- [ ] Generación de repuestos desde el modelo del mueble (p.ej. tapa a medida para un herraje).

## Más adelante

- Realidad aumentada en el teléfono para ver el mueble en el espacio.
- Marketplace comunitario de catálogos y modelos.
- Integración con cortadoras CNC (G-code/DXF por pieza).
