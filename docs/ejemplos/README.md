# Ejemplos

Proyectos y muebles de ejemplo en el formato `.handy.json`. Son el formato objetivo del proyecto completo (M2); hoy el motor genera el objeto `furniture[].model` con `generateCabinet()`.

- `armario-dormitorio.handy.json`: armario de 2 puertas con zócalo, unido con minifix, dentro de un dormitorio con una ventana orientada al norte.
- `cocina-base.handy.json`: módulo de cocina bajo de 600 mm con puerta.

Genera el equivalente del primer ejemplo con:

```bash
pnpm cli cabinet --width 800 --height 2000 --depth 500 --shelves 3 --doors 2 --plinth 80 --joinery minifix --json
```

## Mundo de ejemplo

- `apartamento-demo.world.json`: dormitorio y cocina con muros de distinto grosor, puerta, paso, ventanas y seis muebles colocados.
- `apartamento-demo.gltf`: el mismo mundo exportado para Blender (File › Import › glTF 2.0).
- `apartamento-demo.png`: vista previa del glTF.

Se regeneran con `pnpm --filter @handy/core demo:world`.
