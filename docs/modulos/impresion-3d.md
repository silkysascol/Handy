# Módulo: Impresión 3D (repuestos y accesorios)

## Objetivo

Que Handy entregue modelos listos para imprimir de las piezas pequeñas que un mueble o una casa necesita y que suelen faltar o romperse, y que esas piezas se puedan generar a medida desde los parámetros del proyecto.

## Biblioteca inicial (paramétrica)

| Pieza | Parámetros | Uso |
| --- | --- | --- |
| Soporte de repisa (pin 5 mm) | diámetro, largo, ancho de apoyo | reemplazo de soportes metálicos |
| Tapa para confirmat / cam-lock | diámetro de cabeza, color | esconder uniones |
| Pata / nivelador | altura, diámetro, rosca o inserción | muebles de melamina |
| Esquinero / escuadra | lados, espesor, agujeros | refuerzo oculto |
| Clip de cables / pasacables | diámetro, espesor del tablero | escritorios |
| Tirador | largo, alto, separación de tornillos (96/128/160) | frentes |
| Tope de puerta / amortiguador | diámetro, altura | puertas |
| Separador de cajón | ancho interior del cajón, alto, grilla | organización |
| Tapa de hueco (grommet) | diámetro de agujero | cubiertas |
| Plantilla de perforado sistema 32 | pitch, diámetros, offset 37 mm | armado sin CNC |

Cada pieza define tolerancias ajustables (holgura de ajuste 0,2–0,4 mm) y orientación de impresión sugerida.

## Técnica

- Modelado con CSG paramétrico en TypeScript sobre `manifold-3d` (WASM) o JSCAD; corre en navegador y Node.
- Exportación STL binario y 3MF (con unidades mm y metadata).
- Vista previa en el mismo visor Three.js.
- Perfil recomendado: PETG para piezas estructurales, PLA para tapas y decoración; relleno 30–50 % en soportes.

## Generación desde el proyecto

Ejemplos: "genera soportes para las 3 repisas", "tapa para los 12 confirmat en blanco", "tirador de 128 mm para las 2 puertas". El MCP expondrá `generate_part` con el modelo del mueble como contexto.

## Preguntas abiertas

- ¿Repositorio de modelos comunitario dentro del repo o externo (Printables/Thingiverse) con licencias claras?
- Validación: imprimir y medir cada pieza antes de marcarla como "probada".
