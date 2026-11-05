# Módulo: Espacios (habitaciones escaneadas)

## Objetivo

Importar la habitación real, medida con el LiDAR del iPhone/iPad u otra fuente, y diseñar los muebles dentro de ella: ubicarlos, estirarlos para llenar un hueco, evitar puertas y ventanas, y ver el resultado en 3D.

## Fuentes de datos

| Fuente | Formato | Contenido | Prioridad |
| --- | --- | --- | --- |
| Apple RoomPlan (apps como RoomScan, Canvas, apps propias) | JSON + USDZ | paredes, puertas, ventanas, aberturas, objetos clasificados con dimensiones | alta: es semántico |
| Polycam | glTF/OBJ/USDZ/PLY/LAS | malla o nube de puntos, a veces plano de planta | alta |
| 3D Scanner App | OBJ/glTF/PLY/USDZ | malla | media |
| Scaniverse, Luma | glTF/PLY | malla / splats | media |
| Plano a mano | medidas en la UI | paredes como polígono + alturas | alta (fallback) |

USDZ no se lee nativamente en navegador; en escritorio se convierte (usdcat/usdzip o librería) y en web se pide glTF.

## Modelo de espacio

```ts
interface Space {
  id: string; name: string;
  walls: Wall[];            // segmentos con espesor y altura
  openings: Opening[];      // puertas, ventanas, pasos; con pared, posición, ancho, alto, altura de antepecho
  fixtures: Fixture[];      // enchufes, interruptores, radiadores, tuberías si se conocen
  mesh?: string;            // referencia a glTF para visualización
  origin: { lat?: number; lon?: number; northAngle?: number }; // para el estudio solar
}
```

## Interacciones

- **Snapping** a paredes y esquinas; detección de colisión con puertas (incluido el barrido de apertura) y ventanas.
- **Arrastre de medidas**: tirar de una cara cambia ancho/alto/profundidad y recalcula lista y precio al instante.
- **Comandos**: "llena el hueco entre la ventana y la pared", "sube 10 cm", "haz dos módulos iguales". Se resuelven con un pequeño parser local y, si no se entiende, con la IA conectada.
- **Proyección**: modo que muestra el mueble "fantasma" en el espacio con cotas respecto a paredes y techo.

## Pipeline técnico

1. Parser de RoomPlan JSON → `Space` (coordenadas en mm, Y arriba).
2. Para mallas sin semántica: detección de planos dominantes (RANSAC) para proponer paredes; el usuario confirma.
3. Visor: Three.js con la malla original semitransparente y los muebles encima.
4. Export: planta DXF/PDF con cotas, glTF del conjunto.

## Preguntas abiertas

- Alineación del norte: RoomPlan no entrega orientación; pedir brújula o que el usuario la marque.
- Precisión del LiDAR (±1–2 cm): avisar y dejar margen de ajuste en obra.
- Soporte Android (ARCore depth) y escáneres de bajo costo.
