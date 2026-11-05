# Sección: Muebles

Segunda entrada del menú. Enfocada en **interfaz y medidas** para muebles de madera y tablero, y también obras menores de albañilería como un asador de ladrillo.

## Objetivo

Diseñar el mueble de forma paramétrica, ver la lista de corte (o de ladrillos), los herrajes, la cotización y los avisos de diseño, y comprobar con una simulación simple que va a aguantar la carga.

## Muebles de madera y tablero

### Generadores

| Generador | Estado | Parámetros principales |
| --- | --- | --- |
| Gabinete caja | hecho | ancho, alto, prof., repisas, puertas (0–2), zócalo, unión, espesor |
| Cajonera | pendiente | cantidad y alto de cajones, correderas (telescópica, oculta, soft-close), frentes |
| Módulo cocina bajo/alto | pendiente | 600 prof. bajo / 350 alto, zócalo 100–150, cubierta |
| Closet | pendiente | divisiones, barra de colgar, cajoneras internas, puertas corredizas |
| Biblioteca / estantería | pendiente | módulos repetidos, trasera, refuerzos |
| Escritorio / mesa | pendiente | cubierta, patas o costados, pasacables |
| Cama / banca | pendiente | bastidor de madera maciza, listones |

Todos producen un `FurnitureModel` con paneles posicionados en 3D; la UI los dibuja como cajas y permite arrastrar caras para cambiar medidas.

### Reglas constructivas (`validateFurniture`)

- Pandeo de repisas: luz máxima por espesor (15 mm → 600, 18 mm → 800, 25 mm → 1000). Sugiere divisor o refuerzo.
- Puertas: > 600 mm de ancho avisa; > 2100 mm sugiere dividir. Bisagras por alto (2/3/4/5).
- Cajones: holgura de correderas 12,7 mm por lado o según catálogo; frente con 2–3 mm de luz.
- Profundidad poco habitual (> 650 mm) avisa.
- Uniones visibles: confirmat deja cabezas; propone minifix o tarugos.

### Sistemas de unión

| Sistema | Visible | Resistencia | Costo | Nota |
| --- | --- | --- | --- | --- |
| Confirmat 7x50 | sí (tapa) | alta | bajo | Estándar en talleres. |
| Minifix (excéntrica + perno + tarugo) | no | media-alta | medio | "Sin tornillos visibles". Perforado preciso. |
| Tarugo + cola | no | alta | bajo | No desmontable. |
| Pocket hole | oculto por dentro | media | bajo | Bastidores y madera maciza. |
| Lamello / Clamex | no | alta | alto | Desmontable, profesional. |

### Sistema 32 mm

Perforaciones de 5 mm cada 32 mm en los costados (hilera a 37 mm del canto frontal) para repisas y bisagras; exportable para CNC o plantilla imprimible (ver [objetos.md](objetos.md)).

## Muebles de ladrillo (asador, mesón, jardinera)

- Generador de **asador / parrilla de ladrillo**: ancho, alto de la boca, profundidad, altura del plano de fuego (800–900 mm), chimenea opcional, repisa lateral.
- Aparejo configurable (soga, tizón, inglés) con ladrillo estándar del país (p.ej. 240 x 115 x 71 o 290 x 140 x 70 mm) y junta de 10–15 mm.
- Salida: cantidad de ladrillos (comunes y refractarios para la cámara), mortero (sacos), refuerzos (ángulo o platina para dintel), y cotización.
- Reglas: dintel sobre la boca con apoyo ≥ 150 mm por lado, cámara de fuego con refractario, separación a muros medianeros, altura mínima de chimenea.
- También: mesones de obra para cocina exterior, jardineras y muretes bajos.

## Simulación de esfuerzos

Cada mueble puede evaluarse con cargas típicas (libros 60 kg/m², ropa, TV, persona sentada) para ver deformación y zonas críticas. Ver [estructura.md](estructura.md).

## Asistente estético y constructivo

- **Colorimetría**: a partir del decorado (p.ej. "Roble Americano") propone combinaciones (monocromo, complementario, análogo) para frentes, cuerpo e interiores, con el catálogo de decorados de los fabricantes locales.
- **Texturas**: textura del decorado en el visor con la veta correcta según `grain`.
- **Proporciones**: frentes balanceados, alturas de cajones progresivas, módulos estándar (cocina 150/300/450/600/900).
- **Armado**: orden de montaje, posición de herrajes y plano de armado paso a paso.

## Exportaciones

CSV y PDF de lista de corte, DXF por pieza, plano de armado, glTF/OBJ para Blender ([exportacion.md](exportacion.md)) y más adelante nesting por tablero.

## Preguntas abiertas

- Formatos de tablero por país (1830x2500, 1830x2750, 2150x2440, 1220x2440) y espesores comunes.
- Enchapado: descontar o no el canto de 1 mm en la medida de las piezas.
- Aserradero corta a medida (precio por corte) o el usuario corta: afecta la cotización.
