# Mocks de UI/UX

Tres pantallas en HTML (abrir en el navegador) que fijan la dirección de la interfaz. El lienzo editable, con los paneles desplegables funcionando, vive en el artefacto de Claude "Handy UI Mocks".

## Principios (estilo Blender)

1. **Pocas cosas a la vista, todo desplegable.** Cabecera de 36 px con las tres secciones, barra de herramientas de iconos a la izquierda, visor a pantalla completa y un panel de propiedades a la derecha hecho solo de secciones plegables. Cada sección cerrada muestra un resumen de una línea en su cabecera.
2. **El precio total vive en una esquina del visor**, grande y siempre actualizado. Al pasar el mouse (o enfocar con teclado) aparece el resumen: tableros, herrajes, extras, qué cuesta todo en una sola tienda y la mezcla óptima. No hay pantalla de desglose aparte.
3. **Oscuro por defecto**, claro y automático disponibles. Tokens: `--bg`, `--header`, `--panel`, `--panel-2`, `--border`, `--text`, `--text-2`, `--accent` (selección, como el naranja de Blender), `--teal` (estados OK), `--ok-*`, `--warn-*`, `--ghost` (sugerencias). Los materiales reales (maderas, tableros) conservan su color.
4. **Una línea de comandos** en la base del visor, siempre visible, para órdenes en lenguaje natural que resuelve Handy o Claude por MCP.
5. Texto en Inter a 12 px, cifras en JetBrains Mono.

## Pantallas

| Archivo | Qué muestra |
| --- | --- |
| `Main.html` | Muebles. Cocina de 4 módulos. Cajón 2 seleccionado y abierto al 70 % según la corredera elegida (ficha de Madecentro); lavavajillas Electrolux sugerido en el hueco del cajón; alturas de desagüe, agua y gas marcadas en el muro; tira LED con el recorrido del cable; ensamble sin tornillos a la vista; esfuerzos. Comando de ejemplo: "poner un lavavajillas Electrolux donde está este cajón". |
| `Espacios.html` | Planta con muros de distinto grosor, aberturas, puntos eléctricos y canalización probable por confianza; muro seleccionado; eléctrica con norma y tipo de canalización; sanitaria y gas; sol; muebles del proyecto ubicados. |
| `Objetos.html` | Soporte de repisa paramétrico tomado del mueble; parámetros, impresión, esfuerzos y exportación en secciones; precio de imprimir frente a comprar. |

Los precios son ilustrativos.
