# Sección: Objetos

Tercera entrada del menú. Cosas pequeñas: repuestos, accesorios y piezas a medida para imprimir en 3D o fabricar.

## Objetivo

Prototipar rápido una pieza fiel a lo que el usuario necesita (medidas exactas, tolerancias) y exportarla lista para el slicer o para Blender.

## Biblioteca inicial (paramétrica)

| Pieza | Parámetros | Uso |
| --- | --- | --- |
| Soporte de repisa (pin 5 mm) | diámetro, largo, ancho de apoyo | reemplazo de soportes metálicos |
| Tapa para confirmat / cam-lock | diámetro de cabeza, color | esconder uniones |
| Pata / nivelador | altura, diámetro, rosca o inserción | muebles de melamina |
| Esquinero / escuadra | lados, espesor, agujeros | refuerzo oculto |
| Clip de cables / pasacables | diámetro, espesor del tablero | escritorios |
| Tirador | largo, alto, separación 96/128/160 | frentes |
| Tope de puerta / amortiguador | diámetro, altura | puertas |
| Separador de cajón | ancho interior, alto, grilla | organización |
| Tapa de hueco (grommet) | diámetro de agujero | cubiertas |
| Plantilla de perforado sistema 32 | pitch, diámetros, offset 37 mm | armado sin CNC |
| Caja a medida | interior, espesor de pared, tapa | repuestos y organización |
| Soporte de pared genérico | carga, tornillos, forma | accesorios |

Cada pieza define tolerancias ajustables (0,2–0,4 mm), orientación de impresión sugerida y material recomendado (PETG estructural, PLA decorativo).

## Editor de objetos

- Primitivas (caja, cilindro, perfil extruido) y operaciones booleanas; parámetros editables con sliders y comandos.
- Perfil 2D a mano alzada o importado (SVG/DXF) y extrusión o revolución.
- Vista previa en el mismo visor con cotas.

## Técnica

- CSG paramétrico en TypeScript sobre `manifold-3d` (WASM); corre en navegador y Node.
- Exportación STL binario, 3MF (mm, metadata) y glTF.
- Comprobación de imprimibilidad: espesor mínimo de pared, voladizos > 45°, tamaño vs. cama.

## Generación desde el proyecto

"Genera soportes para las 3 repisas", "tapa para los 12 confirmat en blanco", "tirador de 128 mm para las 2 puertas". El MCP expondrá `generate_part` con el mueble como contexto.

## Preguntas abiertas

- Repositorio de modelos comunitario dentro del repo o externo (Printables) con licencias claras.
- Validación: imprimir y medir cada pieza antes de marcarla como "probada".
