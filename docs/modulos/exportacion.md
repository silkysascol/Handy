# Módulo: Exportación y prototipado rápido

La idea central de Handy: **prototipos rápidos y fieles** a lo que el usuario quiere, que salen sin fricción a los programas profesionales para presentación, render o fabricación.

## Formatos

| Formato | Para qué | Destino típico | Fase |
| --- | --- | --- | --- |
| **glTF / GLB** | Escena 3D completa con materiales, texturas y jerarquía (espacio → muebles → piezas) | Blender, Unity, Unreal, Godot, three.js, visores web | M2 |
| OBJ + MTL | Geometría simple y universal | Blender, SketchUp, Rhino | M2 |
| STL / 3MF | Piezas para imprimir | Cura, PrusaSlicer, Bambu Studio | M2 |
| DXF / SVG | Planos 2D con cotas, piezas para corte CNC/láser | AutoCAD, LibreCAD, Inkscape, aserraderos | M2 |
| PDF | Planos, lista de corte, plano de armado, cotización, informe estructural | Taller, cliente | M1 |
| CSV / JSON | Lista de corte, materiales, cotización | Planillas, optimizadores de corte | M1 |
| USDZ | Vista en AR en iPhone | Quick Look | M4 |
| IFC | Espacios con muros, aberturas y niveles para BIM | Revit, ArchiCAD, FreeCAD | M6 |
| FBX | Pipelines que lo exigen | vía script de Blender | M6 |

## Reglas de exportación

- Unidades: metros en glTF/OBJ (estándar), mm en STL/3MF/DXF. Handy convierte al salir.
- Jerarquía con nombres legibles: `Dormitorio/Armario/Costado_izquierdo`, para que en Blender se pueda editar pieza por pieza.
- Materiales PBR con la textura del decorado y la veta orientada; colores de muros y pisos.
- Origen de cada mueble en su esquina inferior-izquierda-trasera, con transformaciones limpias (sin escalas negativas).
- Metadatos (medidas, material, cantos) como `extras` en glTF para que un add-on los lea.

## Add-on de Blender (planificado)

Importar `.handy.json` directamente: crea la escena con colecciones por recinto y mueble, materiales, y un panel con lista de corte. Permite el camino inverso: ajustar medidas en Blender y actualizar el proyecto.

## Importación

glTF/OBJ/PLY/USDZ para escaneos y objetos externos; SVG/DXF para perfiles; `.handy.json` para proyectos.
