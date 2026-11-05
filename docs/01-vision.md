# Visión

## El problema

Hacer un mueble a medida hoy implica saltar entre cinco herramientas: un programa de CAD (o papel), una planilla para la lista de corte, el sitio web de la tienda para los precios, una app para medir la habitación y otra persona (o YouTube) para saber si la repisa va a pandear o cómo esconder los tornillos. Para arquitectura doméstica pasa lo mismo: dónde van los enchufes, qué pendiente lleva el desagüe, cuánto sol entra por esa ventana en invierno.

## La idea

Handy junta todo eso en una sola herramienta **abierta** y **local**, y la expone a las IAs para que diseñar sea una conversación: "hazme un closet de 2,4 m con dos cajoneras, que no se vean tornillos y dime cuánto cuesta en mi ferretería".

## Para quién

- **Carpinteros y talleres pequeños** que cotizan muebles de melamina a diario.
- **Makers y autoconstructores** que diseñan sus propios muebles y repuestos imprimibles.
- **Arquitectos, diseñadores de interiores y estudiantes** que necesitan medidas estándar y estudios de sol rápidos.
- **IAs** (Claude, agentes locales) que actúan como asistentes de diseño y necesitan un motor confiable para geometría, reglas y precios.

## Principios

1. **Milímetros, siempre.** El motor trabaja en mm enteros; la UI muestra cm, m o pulgadas.
2. **Local-first y archivos abiertos.** Un proyecto es un `.handy.json` que puedes versionar en git. Exporta a STL, 3MF, glTF, DXF, CSV y PDF.
3. **Región-agnóstico.** Precios, formatos de tablero, normativas eléctricas y sanitarias se cargan desde datos por país; la comunidad los mantiene.
4. **Reglas explicables.** Cada aviso o sugerencia cita la regla ("luz > 800 mm en 18 mm pandea") o el criterio estético que la motiva.
5. **Una sola fuente de verdad.** Web, ejecutable, CLI y MCP usan el mismo `@handy/core`.
6. **Cotización honesta.** Cada precio muestra tienda, fecha y si es estimado. Handy nunca inventa un precio.

## Lo que Handy no es

- No es un CAD general. Modela muebles de tablero y piezas paramétricas, no superficies libres.
- No reemplaza al profesional en instalaciones eléctricas o sanitarias: entrega medidas de referencia y cita normas, no certifica.
- No es un marketplace. Muestra precios, no vende.
