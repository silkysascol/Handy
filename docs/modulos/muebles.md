# Sección: Muebles

Segunda entrada del menú. Enfocada en **interfaz y medidas** para muebles de madera y tablero, y también obras menores de albañilería como un asador de ladrillo.

## Objetivo

Diseñar el mueble de forma paramétrica, ver la lista de corte (o de ladrillos), los herrajes, la cotización y los avisos de diseño, y comprobar con una simulación simple que va a aguantar la carga.

## Muebles de madera y tablero

### Generadores

| Generador | Estado | Parámetros principales |
| --- | --- | --- |
| Gabinete, closet, cajonera, biblioteca | hecho, un solo generador | ancho, alto, prof., repisas, puertas, divisiones, cajones y su alto, barra de colgar, zócalo, unión, espesor |
| Correderas ocultas y soft-close | pendiente | hoy solo telescópica de 250 a 550 mm |
| Módulo cocina bajo/alto | pendiente | 600 prof. bajo / 350 alto, zócalo 100–150, cubierta |
| Puertas corredizas de closet | pendiente | solape, cantidad de hojas, riel |
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

## Ensamble para quien lo hace él mismo: sin tornillos a la vista y sin perforaciones milimétricas

El usuario de Handy manda a cortar y arma en casa. El generador elige el **sistema de unión según la habilidad y las herramientas** que el usuario declara y lo que ofrece la tienda:

| Lo que el usuario tiene | Sistema propuesto | Cómo se logra la precisión |
| --- | --- | --- |
| Solo destornillador y taladro básico | Minifix (excéntrica) + tarugo, perforado por la tienda | La tienda hace la **perforación CNC** con el archivo que exporta Handy (donde el servicio exista; se verifica por ciudad). El usuario solo encaja y gira un cuarto de vuelta. |
| Taladro y paciencia | Minifix o tarugos con **plantilla imprimible en 3D** (sección Objetos) | La plantilla fija las posiciones de las brocas de 8 y 15 mm; sin medir. |
| Taladro, sin impresora 3D | Tarugos con **guía de tarugos** comercial y topes de profundidad | Handy entrega las cotas de la guía. |
| Nada de perforar | Uniones por **ranura y encaje** (fondo ranurado, repisas en ranura) y herrajes atornillados desde el interior (escuadras ocultas, clips de bisagra) | Diseño que evita la perforación precisa. |
| Fresadora o acceso a Clamex | Clamex/Lamello desmontable | Opción avanzada, no por defecto. |

Handy siempre muestra lo que ese sistema le exige al usuario (herramientas, tiempo, dificultad de 1 a 5) y la alternativa si no lo tiene. El modo "sin tornillos a la vista" es el **predeterminado** para este usuario.

## Asistente de decisiones

Para cada elección habitual Handy compara costo, dificultad de armado, uso y resultado, y recomienda con la razón:

- **Cajón vs tapa abatible con pistón y bisagra**: un cajón cuesta más (corredera + 5 piezas) y exige precisión, pero es más cómodo para ollas; una tapa con pistón a gas es más barata y fácil de armar, mejor en muebles altos. Handy muestra ambos precios y el movimiento de cada uno en el visor.
- Melamina de 15 vs 18 mm, HDF de 3 vs 5,5 mm de fondo, bisagra recta vs codo según el solape, corredera telescópica vs oculta, tirador vs gola, zócalo fijo vs patas con zócalo clip.
- Comprar el repuesto vs imprimirlo (sección Objetos).

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

El panel de la pieza muestra el herraje, los parámetros, un control de apertura (0–100 %) y un botón de animar. Los modelos 3D de los herrajes son **genéricos paramétricos de Handy** (bisagra 35, corredera, abatible) con su ficha de movimiento; opcionalmente se importa el STEP del fabricante (Hettich, Häfele, Blum) cuando el usuario quiere el modelo exacto. Las referencias de la tienda (Madecentro, Homecenter) se mapean a un genérico: cuando Claude está conectado puede buscar herrajes compatibles con la medida y la carga, proponerlos y fijar el movimiento al elegido. Detalle en [../investigacion/herrajes-3d-y-armado.md](../investigacion/herrajes-3d-y-armado.md). Handy detecta colisiones durante el movimiento y avisa con la corrección.

### Comprobador de colisiones (hecho, nivel 1)

`checkMotionCollisions(model, obstacles)` en `@handy/core` recorre la apertura de cada pieza móvil (giro de bisagra sobre la cara frontal, traslación de corredera, abatible) en 24 pasos, calcula su caja envolvente en cada instante y la compara con las piezas fijas del mueble y con **obstáculos** externos: muros, la puerta abierta de un lavavajillas, otro mueble. Reporta el primer instante del choque con el ángulo o el recorrido y una sugerencia (bisagra de menor ángulo, tope, separar el mueble). Los solapes que ya existen en reposo se ignoran. Disponible en la CLI (`--wall-left`, `--wall-right`) y en el MCP (`check_collisions` y `obstacles` en `design_cabinet`).

Siguientes niveles: cajas orientadas (OBB) en vez de envolventes para menos falsos positivos, obstáculos tomados automáticamente del espacio (muros, aberturas y muebles vecinos de la sección Espacios) y de los electrodomésticos con su barrido de puerta, y colisión entre dos piezas móviles a la vez (dos puertas en esquina).

## Electrodomésticos y comandos de reemplazo

"Poner un lavavajillas Electrolux donde está este cajón" se resuelve así: se identifica la pieza, se busca el modelo en el catálogo (o la IA sugiere uno similar con medidas estándar: 598 × 820 × 575 para lavavajillas de 60 cm), se reemplaza el módulo por un hueco con el volumen fantasma del aparato, se recalculan precio, servicios y colisiones. Biblioteca inicial: lavavajillas, horno, estufa, cubierta de inducción, campana, refrigerador, lavadora, microondas; cada uno con medidas, holguras de instalación, conexiones (agua, desagüe, gas, eléctrica) y potencia.

## Servicios del mueble: desagüe, agua, gas, eléctrica

Cuando un módulo lleva fregadero, estufa o electrodoméstico, Handy calcula y dibuja en el muro los puntos de conexión con reglas por país (`packages/arch/data/<cc>/plumbing.json`, `electrical.json`): altura del desagüe del fregadero (típico 450–500 mm, bajo el sifón), salidas de agua (550–600 mm), entrada de gas para la estufa (500–600 mm, desplazada del eje del aparato), toma del lavavajillas (300 mm, en el módulo vecino) y de la campana (1 800–2 000 mm). Las reglas citan norma (NTC 1500 y RETIE en Colombia) y se muestran como rango, no como valor único.

## Iluminación integrada y cableado

Si el mueble lleva luces (tiras LED bajo alacena, luz interior con sensor de puerta, perfil en repisa), Handy añade driver, metros de tira y cable a la lista, propone el **recorrido del cable** (por el fondo de 3 mm, por ranura en costados o por zócalo) con las perforaciones necesarias y lo dibuja en el visor y en el plano de armado.

## Ensamble sin tornillos a la vista

Es una opción de todo el mueble. Al activarla, el generador cambia confirmat por minifix + tarugo o tarugo encolado en todas las juntas visibles, usa bisagras clip y correderas ocultas, deja confirmat solo donde no se ve (zócalo, trasera) y actualiza la lista de herrajes, el precio y el plano de armado. El visor resalta las juntas afectadas y el asistente explica el cambio.

## Estructuras en perfiles de acero, aluminio y drywall

Bases de mesa, estanterías de marcos, estructura de mesones y asadores, bastidores. Despiece lineal de barras, uniones según habilidad y mixto con madera. Ver [metal.md](metal.md).

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
