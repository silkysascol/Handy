# Sección: Espacios

> Hecho hasta ahora: habitaciones rectangulares con grosor por muro, puertas, ventanas y pasos; habitaciones contiguas que comparten muro (`attachRoom`, `adjacentWall`, `effectiveOpenings`); pisos; cotas y arrastre en el visor. Pendiente: formas no rectangulares, niveles, eléctrica, sanitaria, sol e importación de escaneos.

Primera entrada del menú. Enfocada en **interfaz y medidas** para crear apartamentos, cuartos y casas: dibujar el mapa del lugar, definir grosor de muros, aberturas, puntos eléctricos, y traer habitaciones escaneadas.

## Objetivo

Que en minutos se tenga un plano fiel del lugar (medidas reales, muros con su grosor, puertas, ventanas, enchufes) sobre el que se diseñan muebles, se simula el sol y se exporta a Blender u otros programas.

## Funciones

### Dibujar el mapa

- Dibujar muros como polilíneas con **grosor por muro** (100, 150, 200, 300 mm o libre) y altura; muros interiores y exteriores con distinto grosor por defecto.
- Snapping ortogonal, a 45°, a extremos y a mitades; cotas en vivo mientras se dibuja.
- Entrada por teclado: "3600" fija la longitud del tramo, "@90" el ángulo.
- Puertas y ventanas sobre el muro: ancho, alto, antepecho, sentido de apertura y barrido.
- Niveles (pisos) y techos con altura; escaleras como volumen reservado en M1.
- Recintos detectados automáticamente a partir de muros cerrados: nombre, área y perímetro.

### Importar escaneos (LiDAR)

| Fuente | Formato | Contenido |
| --- | --- | --- |
| Apple RoomPlan (RoomScan, Canvas, apps propias) | JSON + USDZ | muros, puertas, ventanas, objetos con dimensiones |
| Polycam | glTF/OBJ/USDZ/PLY/LAS | malla o nube de puntos |
| 3D Scanner App, Scaniverse, Luma | OBJ/glTF/PLY | malla |
| Plano a mano | dibujo en la UI | fallback universal |

Al importar una malla sin semántica se proponen muros por detección de planos (RANSAC) y el usuario confirma o corrige con el editor de mapa.

### Puntos eléctricos e inferencia de canalización

- Colocar enchufes, interruptores, luces, tablero, salidas de TV/red, con alturas estándar del país (ver [arquitectura.md](arquitectura.md)).
- **Inferencia de conexión**: a partir de los puntos colocados y las reglas habituales de instalación, Handy estima **por dónde va probablemente la canalización** y cómo se agrupan los circuitos, con un nivel de confianza:
  - Trazados verticales desde cada punto hacia el cielo o el piso (según práctica del país: cielo en losa, piso en radier) y horizontales a altura de interruptores o sobre el cielo falso.
  - Agrupación de circuitos por tipo (iluminación, enchufes generales, cocina/lavado, aire acondicionado) y por recinto, con calibre y protección sugeridos.
  - Zonas "no perforar" dibujadas sobre el muro, útiles antes de colgar un mueble o una repisa.
  - Cada trazado se muestra como probable (verde), posible (amarillo) o desconocido (gris); el usuario puede confirmar con un detector de cables o fotos de obra y Handy aprende la regla para ese proyecto.
- Lista de materiales eléctrica (cajas, ductos, metros de cable estimados) para cotizar.

### Sanitaria y sol

Ver [arquitectura.md](arquitectura.md): trazado de desagües con pendientes y estudio solar según orientación y ubicación.

### Interacciones con muebles

- Snapping a muros y esquinas; colisión con barridos de puertas y ventanas.
- **Arrastre de medidas**: tirar de una cara del mueble cambia su tamaño y recalcula lista de corte y precio al instante.
- Comandos: "llena el hueco entre la ventana y el muro", "sube 10 cm", "dos módulos iguales".
- Modo proyección: mueble "fantasma" con cotas respecto a muros y techo.

## Modelo de datos

```ts
interface Space {
  id: string; name: string;
  levels: Level[];
  origin: { lat?: number; lon?: number; northAngle?: number };
}
interface Level { id: string; elevation: number; height: number; walls: Wall[]; openings: Opening[]; rooms: Room[]; electrical: ElectricalPoint[]; plumbing: PlumbingFixture[]; mesh?: string }
interface Wall { id: string; from: [number, number]; to: [number, number]; thickness: number; height: number; kind: "exterior" | "interior" | "partition"; material?: "brick" | "concrete" | "drywall" | "wood" | "block"; structural?: boolean }
interface Opening { id: string; wall: string; type: "door" | "window" | "pass"; offset: number; width: number; height: number; sill?: number; swing?: "in" | "out" | "slide" }
interface ElectricalPoint { id: string; type: "outlet" | "switch" | "light" | "panel" | "data" | "tv"; wall?: string; x: number; y: number; z: number; circuit?: string }
```

Todo en mm enteros, Y arriba.

## Preguntas abiertas

- Orientación del norte en escaneos: pedir brújula o marcarla a mano.
- Precisión LiDAR (±1–2 cm): avisar y dejar margen.
- Práctica eléctrica por país (canalización por losa vs. por piso vs. por cielo falso) como dato configurable.

## Muebles sueltos en el cuarto

Un mueble se coloca siempre respecto a un muro: a cuánto queda de su extremo izquierdo (`offset`) y, si no va pegado, a cuánto queda su espalda del muro (`gap`). Sin `gap` va contra el muro. Con `gap` queda suelto, mirando hacia donde mira ese muro. Así una mesa, una isla o una estantería exenta usan las mismas órdenes, cotas y revisiones que un armario.

| Quieres | Dices |
| --- | --- |
| Crear algo en el centro, con la habitación seleccionada | "mesa de tubo de 120 x 75 x 60", "isla de 180 x 90 x 60 con 4 cajones" |
| Crearlo contra un muro, desde la habitación | "armario de 80 x 200 x 50 contra el muro sur" |
| Crearlo separado, desde un muro | "mesa de tubo de 120 x 75 x 60 separada 80 cm", "... a 1 m del muro" |
| Separarlo o juntarlo | "sepáralo 60 cm", "aléjalo 20 cm", "acércalo 20 cm", "pégalo al muro" |
| Centrarlo | "en el centro del cuarto" |
| Girarlo sin moverlo de sitio | "gíralo", "gíralo a la izquierda", "dale media vuelta" |
| Llevarlo a otro muro | "pásalo al muro este" |

Con el mouse: arrastrar de lado lo mueve por su muro; arrastrar hacia adentro lo despega. Un mueble pegado necesita un tirón de 20 cm para soltarse, y uno colgado no se suelta. Hay imán al muro, al centro del cuarto y al muro de enfrente. Las flechas arriba y abajo lo alejan o lo acercan; R lo gira. Las estructuras de tubo, que son huecas, se agarran por cualquier parte de su volumen.

Al seleccionarlo, las cotas muestran también la distancia a su muro y al de enfrente.

Revisiones nuevas en `checkWorld`:

- `tight-passage`: entre un mueble suelto y un muro u otro mueble queda un paso de 150 a 600 mm. Lo mínimo para pasar son 600 y lo cómodo 800. Menos de 150 no se considera pasillo.
- `door-clearance`: un mueble deja menos de 900 mm frente a una puerta o un paso.
- `blocks-door` y `blocks-window` ahora miran los cuatro muros, no solo el del mueble: uno en esquina también puede tapar la puerta del muro vecino.

Límites: los muebles miran a uno de los cuatro muros; no hay ángulos libres. No se modela el barrido de la hoja de las puertas del cuarto.

## Habitaciones en L, columnas y buitrones

Una habitación sigue siendo un rectángulo con cuatro muros, pero puede tener **macizos** dentro: volúmenes del color del muro que ocupan piso. Con eso se resuelven los casos reales sin cambiar el resto del modelo:

| Caso | Cómo se dice, con la habitación seleccionada |
| --- | --- |
| Habitación en L | "recorta la esquina noreste 2 x 1,5 m" |
| Columna suelta | "columna de 30 x 30 a 2 m del muro oeste y 1 m del muro norte" |
| Columna o mocheta contra un muro | "columna de 30 x 30 pegada al muro sur a 1,5 m del muro este" |
| Buitrón o ducto en una esquina | "buitrón de 60 x 40 en la esquina suroeste" |
| Muro bajo o poyo | "muro bajo de 150 x 12 a 2 m del muro norte" (90 cm de alto si no se dice otro) |

Las medidas son ancho (de oeste a este) por fondo (de norte a sur). Lo que no se diga queda centrado. Las esquinas son noroeste, noreste, suroeste y sureste.

Con el macizo seleccionado (clic en la vista o en la lista): "muévela 20 cm al este", "a 1 m del muro norte", "céntrala", "40 x 60", "alto 1 m", "hasta el techo", "quítala". Las flechas la mueven 10 mm hacia el punto cardinal; con Mayús, 100. Las cotas muestran la distancia a los cuatro muros.

Qué cambia con un macizo:

- **Piso**: el área libre baja; las baldosas que quedan debajo no se cuentan y las que lo bordean se marcan como recortes, una baldosa entera cada una. El guardaescobas suma sus caras.
- **Muros**: el tramo que tapa deja de estar libre para muebles.
- **Muebles**: `hits-block` si un mueble se mete en él; cuenta como obstáculo al abrir puertas y cajones, y para el aviso de pasillo angosto.
- **Reglas**: no puede cruzarse con otro macizo, salirse de la habitación, ocupar más del 60 % de ella ni tapar una puerta o una ventana. Un muro bajo sí puede ir bajo el antepecho de una ventana.
- **Exportación**: sale a Blender como un volumen más del grupo de muros.

Límites: los macizos son rectangulares y alineados con los muros. No hay muros inclinados ni curvos. Las caras de una esquina cerrada no admiten todavía puertas ni ventanas, y un mueble contra una de esas caras se coloca como mueble suelto, con su separación del muro.

## Electricidad: tomas, interruptores, datos y luces

Cada habitación puede tener puntos eléctricos. Los de pared (toma, interruptor, datos) tienen muro, distancia desde la izquierda y altura; las luces van en el techo, por distancia a los muros oeste y norte.

| Quieres | Dices | Sale |
| --- | --- | --- |
| Una toma, con un muro seleccionado | "toma a 1 m de la izquierda" | a 300 mm del piso |
| Varias en un muro | "3 tomas" | repartidas parejo |
| Toma sobre mesón | "toma de mesón a 60 cm de la derecha" | a 1100 mm, con protección GFCI |
| Interruptor | "interruptor" | a 1100 mm, junto a la puerta de ese muro, a 15 cm del vano |
| Datos o TV | "toma de tv a 1 m de la derecha a 1,2 m del piso" | donde digas |
| Luces, con la habitación seleccionada | "2 luces", "luz a 1 m del muro norte y 2 m del muro oeste" | en el techo, repartidas por el lado largo |
| Tomas automáticas, con la habitación seleccionada | "reparte las tomas" | una cada 3,6 m de muro libre como máximo |

Con un punto seleccionado: "muévela 20 cm a la derecha", "a 1,1 m del piso", "súbela 10 cm", "con protección", "quítala". Las flechas hacen lo mismo de a 10 mm.

Lo que Handy hace con eso:

- **Franjas de no perforar.** Sobre cada toma e interruptor se dibuja una franja roja de 20 cm de ancho, de piso a techo: por ahí suele subir o bajar la tubería. Si un mueble alto o colgado se fija al muro sobre una franja, avisa (`drill-band`).
- **Puntos tapados.** Si un mueble queda delante de una toma o un interruptor, avisa (`point-covered`). Para un interruptor dice que no se podrá accionar.
- **Zonas húmedas.** En cocina, baño, lavadero, patio y similares, las tomas salen con protección de falla a tierra (GFCI).
- **Reparto de tomas.** "reparte las tomas" recorre los tramos libres de muro (sin puertas, columnas ni muebles) y pone las necesarias para que ningún punto del muro quede a más de 1,8 m de una.
- **No deja** poner un punto dentro de una puerta o una ventana, ni en un tramo tapado por una columna, ni una luz dentro de una columna.
- **Costo.** Cada habitación con puntos suma al presupuesto: tomas, interruptores, rosetas, una caja por punto, y un estimado de tubería y cable. La tubería se estima desde cada punto hasta el techo y de ahí a la luz más cercana; el cable son tres hilos por tubo más un 10 %.

Importante: son alturas y distancias de práctica común, no una revisión de norma (RETIE, NTC 2050). No hay tablero, circuitos ni cálculo de cargas. La instalación la define y la valida un electricista; Handy sirve para planear dónde van las cosas, no perforar donde no toca y saber cuánto material comprar.
