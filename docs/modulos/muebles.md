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

## Trabajo por pieza: seleccionar, aislar, ordenar

Al seleccionar una pieza (un cajón, una puerta, un costado) el panel de propiedades cambia a esa pieza y la **línea de comandos queda acotada a ella**: "poner un lavavajillas aquí", "cambia la corredera por una de 450", "hazlo 20 mm más bajo". Con `/` se **aísla** la pieza en el visor (como la vista local de Blender) para ver el detalle de un herraje o una junta; "Sección" corta el módulo por un plano para ver el interior. Las piezas también se agrupan por módulo, así que un comando puede ir a un módulo completo.

## Movimiento por pieza según el herraje

Cada pieza móvil (puerta, cajón, frente abatible, puerta corrediza) lleva una **especificación de movimiento** derivada del herraje elegido, y el visor la anima en tiempo real:

| Herraje | Movimiento | Parámetros que se leen de la ficha |
| --- | --- | --- |
| Bisagra cazoleta 35 mm | giro sobre eje vertical | ángulo máximo (95°, 110°, 155°), overlay, soft-close, clip |
| Corredera telescópica / oculta | traslación hacia el frente | extensión (¾, total, sobreextensión), carga (25/30/40 kg), soft-close o push-open, holgura lateral |
| Sistema abatible (Aventos y similares) | giro sobre eje horizontal, pliegue o elevación paralela | alto del frente admitido, peso, ángulo |
| Corredera de puerta | traslación lateral | solape, cantidad de hojas, carga |
| Pata plegable, mesa extensible | giro o traslación compuesta | rango |

El panel de la pieza muestra el herraje, los parámetros, un control de apertura (0–100 %) y un botón de animar. Los modelos 3D de los herrajes son **genéricos paramétricos de Handy** (bisagra 35, corredera, abatible) con su ficha de movimiento; opcionalmente se importa el STEP del fabricante (Hettich, Häfele, Blum) cuando el usuario quiere el modelo exacto. Las referencias de la tienda (Madecentro, Homecenter) se mapean a un genérico: cuando Claude está conectado puede buscar herrajes compatibles con la medida y la carga, proponerlos y fijar el movimiento al elegido. Detalle en [../investigacion/herrajes-3d-y-armado.md](../investigacion/herrajes-3d-y-armado.md). Handy detecta colisiones durante el movimiento (cajón contra lavavajillas abierto, puerta contra muro) y avisa con la corrección.

## Electrodomésticos y comandos de reemplazo

"Poner un lavavajillas Electrolux donde está este cajón" se resuelve así: se identifica la pieza, se busca el modelo en el catálogo (o la IA sugiere uno similar con medidas estándar: 598 × 820 × 575 para lavavajillas de 60 cm), se reemplaza el módulo por un hueco con el volumen fantasma del aparato, se recalculan precio, servicios y colisiones. Biblioteca inicial: lavavajillas, horno, estufa, cubierta de inducción, campana, refrigerador, lavadora, microondas; cada uno con medidas, holguras de instalación, conexiones (agua, desagüe, gas, eléctrica) y potencia.

## Servicios del mueble: desagüe, agua, gas, eléctrica

Cuando un módulo lleva fregadero, estufa o electrodoméstico, Handy calcula y dibuja en el muro los puntos de conexión con reglas por país (`packages/arch/data/<cc>/plumbing.json`, `electrical.json`): altura del desagüe del fregadero (típico 450–500 mm, bajo el sifón), salidas de agua (550–600 mm), entrada de gas para la estufa (500–600 mm, desplazada del eje del aparato), toma del lavavajillas (300 mm, en el módulo vecino) y de la campana (1 800–2 000 mm). Las reglas citan norma (NTC 1500 y RETIE en Colombia) y se muestran como rango, no como valor único.

## Iluminación integrada y cableado

Si el mueble lleva luces (tiras LED bajo alacena, luz interior con sensor de puerta, perfil en repisa), Handy añade driver, metros de tira y cable a la lista, propone el **recorrido del cable** (por el fondo de 3 mm, por ranura en costados o por zócalo) con las perforaciones necesarias y lo dibuja en el visor y en el plano de armado.

## Ensamble sin tornillos a la vista

Es una opción de todo el mueble. Al activarla, el generador cambia confirmat por minifix + tarugo o tarugo encolado en todas las juntas visibles, usa bisagras clip y correderas ocultas, deja confirmat solo donde no se ve (zócalo, trasera) y actualiza la lista de herrajes, el precio y el plano de armado. El visor resalta las juntas afectadas y el asistente explica el cambio.

## Simulación de esfuerzos

Cada mueble puede evaluarse con cargas típicas (libros 60 kg/m², ropa, TV, persona sentada) para ver deformación y zonas críticas. Ver [estructura.md](estructura.md).

## Asistente estético y constructivo

- **Colorimetría**: a partir del decorado (p.ej. "Roble Americano") propone combinaciones (monocromo, complementario, análogo) para frentes, cuerpo e interiores, con el catálogo de decorados de los fabricantes locales.
- **Texturas**: textura del decorado en el visor con la veta correcta según `grain`.
- **Proporciones**: frentes balanceados, alturas de cajones progresivas, módulos estándar (cocina 150/300/450/600/900).
- **Armado**: orden de montaje, posición de herrajes y plano de armado paso a paso.

## Instrucciones de armado

Al terminar, Handy genera instrucciones visuales paso a paso desde el modelo (PDF sin texto, HTML animado). Ver [armado.md](armado.md).

## Exportaciones

CSV y PDF de lista de corte, DXF por pieza, plano de armado, glTF/OBJ para Blender ([exportacion.md](exportacion.md)) y más adelante nesting por tablero.

## Preguntas abiertas

- Formatos de tablero por país (1830x2500, 1830x2750, 2150x2440, 1220x2440) y espesores comunes.
- Enchapado: descontar o no el canto de 1 mm en la medida de las piezas.
- Aserradero corta a medida (precio por corte) o el usuario corta: afecta la cotización.
