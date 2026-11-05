# Sección: Espacios

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
