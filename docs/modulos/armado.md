# Módulo: Instrucciones de armado

Cuando el mueble está listo, Handy entrega un manual paso a paso al estilo de los muebles para armar, generado desde el modelo. Investigación y referencias en [../investigacion/herrajes-3d-y-armado.md](../investigacion/herrajes-3d-y-armado.md).

## Qué hay hoy

- **En el visor:** selecciona un mueble y pulsa **Armado**, o escribe "¿cómo se arma?". Se descarga un HTML imprimible.
- **Desde tu IA:** `world_assembly { itemId }` devuelve los pasos en texto y escribe el mismo manual junto al archivo del mundo.
- **En código:** `buildAssemblyPlan(model)`, `assemblySvg(model, plan, paso?)` y `assemblyHtml(model, título)` en `@handy/core`.

Ejemplo: [`docs/ejemplos/apartamento-demo-armado.html`](../ejemplos/apartamento-demo-armado.html).

## El manual

1. Portada con el mueble terminado, medidas, número de pasos y tiempo estimado.
2. "Antes de empezar" con todas las herramientas.
3. Inventario de piezas: cada una con su letra, cantidad y medida. Son las mismas del despiece.
4. Inventario de herrajes.
5. Un bloque por paso: dibujo, texto corto, consejo de taller, piezas y herrajes que se usan en ese paso, herramientas.

Los herrajes se reparten entre los pasos según las uniones de cada uno, y la suma de todos los pasos es exactamente la lista de herrajes del mueble. Lo que no encaja en ningún paso se entrega con el último, para que nunca sobre ni falte en el inventario.

## Orden de armado

Mueble de tablero:

1. Piso y techo (y zócalo) sobre el costado izquierdo acostado.
2. Divisiones y entrepaños fijos.
3. El fondo baja por la ranura. Va **antes** de cerrar la caja: después ya no entra.
4. El costado derecho cierra la caja. Se para el mueble y se comprueba la escuadra.
5. Repisas sobre sus soportes.
6. Barra de colgar.
7. Cajones con sus correderas.
8. Puertas y regulación de bisagras.
9. Nivelar y, si es alto, fijar al muro.

Estructura de tubo: marcos laterales, travesaños largos, limpieza y pintura, cubierta o entrepaños, y fijación al muro si es alta y angosta. El texto cambia según sea soldada o atornillada.

El texto y las herramientas de cada paso dependen del sistema de unión: minifix (cuarto de vuelta a la excéntrica), confirmat, tarugos con cola o tornillo inclinado.

## Los dibujos

- Isométrico de líneas en SVG, sin dependencias: se ve igual en pantalla y en papel.
- Lo ya armado va en gris fino. Las piezas del paso van en negro, separadas de su lugar, con una flecha punteada hacia donde entran y su letra en un círculo.
- Los pasos de la caja (1 a 4) se dibujan con el mueble **acostado sobre el costado izquierdo**, que es como se arma de verdad: todo baja desde arriba.
- El orden de pintado se calcula por pares: una pieza se pinta antes que otra solo cuando la segunda puede taparla y no al revés.

## Límites actuales

- No hay ampliaciones de detalle del herraje (la excéntrica y su giro), ni pictogramas.
- El manual es HTML para imprimir desde el navegador; no se genera PDF directo ni animación.
- Los tiempos son estimaciones de taller casero, no mediciones.
- El orden es fijo por tipo de mueble; no se puede reordenar a mano.
- Las letras se asignan por tipo de pieza: dos puertas iguales comparten letra.

## Siguientes pasos

- Ampliación en círculo por herraje, con la acción (cuarto de vuelta, presión, clic).
- Marcar en el dibujo dónde va cada perforación cuando exista el sistema de unión con plantilla.
- Vista del paso dentro del visor 3D, con animación de entrada.
- Pictogramas propios con licencia libre.
