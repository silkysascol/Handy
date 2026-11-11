# Módulo: Pisos y enchapes

> Primera versión hecha en `packages/core/src/flooring.ts`: habitación rectangular, patrón recto o trabado, arranque centrado o desde la esquina, emparejado de recortes, cajas, pega, boquilla y guardaescobas, con cotización. En el visor: selecciona la habitación y escribe "piso de porcelanato 60 x 60". Pendiente: diagonal y espina de pez, plano numerado de cortes, paredes, laminado y vinílico.

Parte de la sección Espacios. Responde: cuánto cuesta el piso de este cuarto, cuántas cajas compro, cómo lo corto para desperdiciar menos, cuánta pega y boquilla necesito.

## Entradas

- Recinto del espacio (polígono con aberturas y columnas) o medidas a mano.
- Formato de la pieza (p.ej. 60 x 60, 20 x 120 tipo madera, 30 x 60), espesor, rectificada o no, precio por caja y piezas por caja (de la tienda).
- Patrón: recto, trabado a ⅓ o ½ (no más de ⅓ en formatos largos para evitar "lippage"), diagonal 45°, espina de pez.
- Junta: 1,5–3 mm rectificada, 3–5 mm no rectificada.
- Punto de partida: centrado en el recinto o desde la pared más visible.

## Cálculo

- **Despiece de piso**: coloca las piezas en el recinto según patrón y punto de partida, calcula cortes en bordes y obstáculos y **reutiliza recortes** cuando el patrón lo permite (los sobrantes de una hilera arrancan la siguiente). Muestra el plano con cada pieza numerada y la lista de cortes para la cortadora.
- **Cajas**: piezas enteras + cortes con reutilización + reserva (5 % recto, 10–15 % diagonal y espina) → cajas enteras; sugiere una caja extra para reparaciones futuras.
- **Pega**: por m² según formato y llana: 3–4 kg/m² (llana 6–8 mm, formatos ≤ 30 x 30), 5–6 kg/m² (llana 10 mm, 60 x 60), 7–8 kg/m² (llana 12 mm o doble encolado, formatos ≥ 60 x 120 o porcelanato). Tipo de pega: cemento cola estándar para cerámica porosa, **flexible / porcelánico** para porcelanato y pisos radiantes, blanca para piedra clara.
- **Boquilla**: fórmula estándar (largo + ancho) × espesor × junta / (largo × ancho) × densidad ≈ kg/m²; p.ej. 60 x 60 x 9 mm con junta 3 mm ≈ 0,15 kg/m². Epóxica para zonas húmedas.
- **Extras**: crucetas o niveladores (cantidad por pieza), guardaescobas por metro lineal, perfil de transición, impermeabilizante en baños, nivelación si el desnivel supera 5 mm en 2 m.
- **Comparación**: cerámica vs porcelanato (precio, absorción, dureza, dificultad de corte: el porcelanato exige cortadora con disco diamantado), formato grande vs pequeño (menos juntas, más desperdicio en cortes).

## Salidas

Plano de despiece con piezas numeradas, lista de compras (cajas, pega, boquilla, crucetas, guardaescobas) con tienda y fecha, costo por m² y total, pasos de instalación con el orden de las hileras.

## Datos por país

`packages/arch/data/<cc>/tiles.json`: formatos comunes, rendimiento de pegas comerciales (sacos de 25 kg), boquillas y sus rendimientos, con fuente.

## Preguntas abiertas

- Pisos de madera laminada y vinílico (SPC): mismo despiece, otras reglas de junta de dilatación y espuma.
- Enchape de paredes (baños, salpicaderos) con el mismo motor.
