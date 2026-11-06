# Módulo: Instrucciones de armado

Cuando el mueble está listo, Handy produce instrucciones visuales paso a paso al estilo de los manuales de IKEA, generadas desde el modelo. Investigación y referencias en [../investigacion/herrajes-3d-y-armado.md](../investigacion/herrajes-3d-y-armado.md).

## Modelo de un paso

```ts
interface AssemblyStep {
  id: string;
  title: string;                 // "Piso y techo a los costados"
  module?: string;               // módulo del mueble al que pertenece
  parts: string[];               // ids de piezas que entran en este paso
  base: string[];                // piezas ya montadas que aparecen
  hardware: { id: string; qty: number }[];
  tools: ("flat-screwdriver" | "phillips" | "allen-4" | "drill" | "mallet" | "glue")[];
  forbidden?: ("hammer" | "power-drill")[];
  insert: { partId: string; from: [number, number, number] }[]; // vector de entrada para las flechas
  details?: { hardwareId: string; action: "quarter-turn" | "push" | "clip" }[];  // ampliaciones
  camera: "iso-front-left" | "iso-front-right" | "front" | "top";
  minutes?: number;
  notes?: string;                // texto opcional (el PDF por defecto es sin texto)
}
```

## Generación automática

1. Grafo de dependencias desde las juntas: una pieza entra cuando existen las piezas a las que se une.
2. Agrupación por módulo y por tipo de operación (pernos, encaje, fondo, correderas, cajones, frentes, unión de módulos, zócalo, cubierta, servicios, iluminación).
3. Heurísticas de taller: primero herrajes en piezas sueltas (pernos, correderas en costados), luego la caja, luego el fondo para escuadrar, después partes móviles, frentes al final.
4. Ensamble sin tornillos a la vista: los pasos muestran la excéntrica y su cuarto de vuelta como ampliación.

## Render

- Vista isométrica de líneas (bordes negros sobre blanco, sin sombreado) con three.js, igual en pantalla, PDF y vídeo.
- Piezas del paso resaltadas; las ya montadas en gris claro.
- Flechas de inserción desde `insert.from`, llamadas con icono y cantidad de cada herraje, ampliaciones en círculo, pictogramas de prohibición.
- Páginas: portada con el mueble terminado, inventario de piezas con medidas, inventario de herrajes, un paso por página, página final con ajuste de frentes y servicios.

## Salidas

PDF A4 sin texto (el estándar), HTML interactivo con animación y narración opcional, vídeo corto por paso, lista de piezas y herrajes en CSV. Todo desde el `.handy.json`; los pasos reordenados se guardan en el proyecto.

## Preguntas abiertas

- Pictogramas propios (no copiar los de IKEA): diseñar un set de 20 iconos con licencia libre.
- Idioma: aunque el PDF es sin texto, la versión HTML lleva narración; definir idiomas iniciales (es, en, pt).
