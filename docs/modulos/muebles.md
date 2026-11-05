# Módulo: Muebles

## Objetivo

Diseñar muebles de tablero (melamina, MDF, contrachapado) de forma paramétrica, obteniendo lista de corte, herrajes, plano de armado y cotización, con reglas que eviten errores comunes.

## Tipos de mueble (generadores)

| Generador | Estado | Parámetros principales |
| --- | --- | --- |
| Gabinete caja | hecho | ancho, alto, prof., repisas, puertas (0–2), zócalo, unión, espesor |
| Cajonera | pendiente | cantidad y alto de cajones, correderas (telescópica, oculta, soft-close), frentes |
| Módulo cocina bajo/alto | pendiente | estándares 600 prof. bajo / 350 alto, zócalo 100–150, cubierta |
| Closet | pendiente | divisiones verticales, barra de colgar, cajoneras internas, puertas corredizas |
| Biblioteca / estantería | pendiente | módulos repetidos, trasera, refuerzos |
| Escritorio | pendiente | cubierta, patas o costados, pasacables |

Todos producen un `FurnitureModel` con paneles posicionados en 3D para que la UI los dibuje como cajas.

## Reglas constructivas (`validateFurniture`)

- Pandeo de repisas: luz máxima por espesor (15 mm → 600, 18 mm → 800, 25 mm → 1000). Sugiere divisor o refuerzo.
- Puertas: > 600 mm de ancho avisa; > 2100 mm sugiere dividir. Cantidad de bisagras por alto (2/3/4/5).
- Cajones: holgura de correderas 12,7 mm por lado (telescópicas) o según catálogo; frente con 2–3 mm de luz.
- Profundidad poco habitual (> 650 mm) avisa.
- Uniones visibles: confirmat deja cabezas; propone minifix o tarugos.

## Sistemas de unión

| Sistema | Visible | Resistencia | Costo | Nota |
| --- | --- | --- | --- | --- |
| Confirmat 7x50 | sí (tapa plástica) | alta | bajo | Estándar en talleres. |
| Minifix (excéntrica + perno + tarugo) | no, desde fuera | media-alta | medio | "Sin tornillos visibles". Requiere perforado preciso. |
| Tarugo + cola | no | alta si bien encolado | bajo | No desmontable. |
| Pocket hole | oculto por dentro | media | bajo | Útil en bastidores y madera maciza. |
| Lamello / Clamex | no | alta | alto | Desmontable, profesional. |

## Sistema 32 mm

Perforaciones de 5 mm cada 32 mm en los costados para repisas y bisagras. El generador deberá calcular las hileras (37 mm desde el canto frontal) y exportarlas para CNC o plantilla.

## Asistente estético y constructivo

- **Colorimetría**: a partir del decorado elegido (p.ej. "Roble Americano") propone combinaciones (monocromo, complementario, análogo) para frentes, cuerpo e interiores. Fuente: paletas HSL calculadas + catálogo de decorados reales de los fabricantes locales.
- **Texturas**: aplica la textura del decorado en el visor con la veta correcta según `grain`.
- **Proporciones**: avisa de frentes desbalanceados, propone alturas de cajones progresivas, aplica módulos estándar (cocina 150/300/450/600/900).
- **Armado**: sugiere el orden de montaje y la posición de herrajes; genera un plano de armado paso a paso.

## Exportaciones

CSV y PDF de lista de corte, DXF por pieza, JSON del proyecto, plano de armado, y más adelante G-code/nesting por tablero.

## Preguntas abiertas

- Formatos de tablero por país (1830x2500, 1830x2750, 2150x2440, 1220x2440) y espesores comunes: recopilar.
- Enchapado: ¿considerar canto de 1 mm vs 0,45 mm en la medida de las piezas? Hoy no se descuenta.
- ¿Aserradero corta a medida (precio por corte) o el usuario corta? Afecta la cotización.
