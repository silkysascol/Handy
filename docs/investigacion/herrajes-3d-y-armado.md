# Investigación: modelos 3D de herrajes e instrucciones de armado

Fecha: 2026-11-06. Resume qué existe para (a) tener modelos 3D de herrajes con una idea fiel del movimiento y (b) generar instrucciones visuales de armado tipo IKEA. Termina con la decisión para Handy.

## A. Modelos 3D de herrajes

### Bibliotecas de los fabricantes (gratis, formato CAD)

| Fabricante | Qué ofrece | Acceso | Nota |
| --- | --- | --- | --- |
| Hettich | Paquetes STEP de bisagras, cajones y correderas; también SAT, IGES, 3DS, DWG/DXF. Más de 15 000 ítems en su eShop. | Descarga directa desde [Hettich CAD](https://www.hettich.com/en-in/services/hettich-cad/cad-downloads) y [paquetes de datos](https://www.hettich.com/en-us/services/hettich-cad/cad-data-packages) | La opción más abierta. Sensys (bisagras) y AvanTech YOU (cajones) están en Cabinet Vision, CAD+T, Microvellum. |
| Häfele | Catálogo de 50 000–60 000 artículos con CAD en STEP y otros formatos, gratis. | Ficha de producto › "Media and Documents" › "CAD Data" ([Häfele CAD](https://www.hafele.com.de/en/info/service/cad-cam-data/431951/), [Click2CAD](https://www.hafele.si/en/info/service/cad-configuration-tools/406/)) | Amplio y presente en Latinoamérica. |
| Blum | 3D de productos individuales y de aplicaciones completas en Product Configurator y Product Database; planificador DYNAPLAN con **comprobación de colisiones**; formato de intercambio BXF. | Requiere cuenta de cliente gratuita ([FAQ Blum](https://www.blum.com/gb/en/services/faq/), [CAD/CAM Data Service](https://blum.com/fi/en/services/industrial-production/cad-cam-dataservice)) | El movimiento (ángulos, extensiones) está en las fichas técnicas, no en el STEP. |
| Guden | Bisagras en STEP, IGES, Parasolid desde la ficha. | [guden.com](https://www.guden.com/control/cadmodels) | Útil para herrajes genéricos. |

Los STEP son geometría estática: el movimiento (eje, ángulo máximo, extensión, carga) hay que modelarlo aparte a partir de la ficha. Para la cotización local (Madecentro, Homecenter) las referencias suelen ser genéricas o de marcas asiáticas sin CAD; se mapean a un **herraje genérico equivalente** de Handy.

### Imagen a modelo 3D (para herrajes sin CAD)

| Herramienta | Licencia | Comentario |
| --- | --- | --- |
| TRELLIS.2 (Microsoft) | MIT | La mejor calidad abierta en 2026; salida GLB con PBR; necesita GPU de 24 GB. |
| TripoSR (Stability + Tripo) | MIT | Muy rápido y ligero (~6 GB VRAM), menor calidad. |
| Hunyuan3D 2.1 (Tencent) | comunitaria con restricciones regionales y comerciales | Buena textura; revisar licencia antes de usar. |
| SF3D, SPAR3D, Hi3DGen, SAM 3D | varias | Alternativas; SAM 3D devuelve splats, no malla limpia. |

Fuentes: [guía de tools 2026](https://builderai.tools/blog/single-image-to-3d-model-pipeline-2026), [estado del arte](https://www.3daistudio.com/state-of-ai-3d-generation-2026), [comparativa](https://www.cmarix.com/blog/top-open-source-ai-models-for-3d-image-generation/).

Conclusión: sirven para un **modelo de aspecto** (que el cliente reconozca el herraje), no para geometría de precisión ni para deducir el movimiento. No vale la pena como camino principal.

### Decisión para Handy

1. **Biblioteca de herrajes genéricos paramétricos** propia (`packages/hardware`): bisagra cazoleta 35 (95/110/155°), corredera telescópica y oculta (¾, total, sobreextensión; 300–600 mm), abatible, corredera de puerta, pata, tirador. Cada uno con geometría simple (cajas y cilindros) y una **ficha de movimiento** (`MotionSpec`). Es lo que anima el visor y lo que da "la idea del movimiento"; el cliente mira el herraje real al comprar y, como dices, cambia poco.
2. **Importación opcional de STEP** de Hettich o Häfele cuando el usuario quiera el modelo exacto (conversión con OpenCascade en el ejecutable). Se asocia al genérico y hereda su movimiento.
3. **Mapeo tienda → genérico**: al buscar "corredera 500 soft-close" en Madecentro, cada oferta se enlaza a un genérico y a sus parámetros; la comunidad y Claude completan las fichas que falten.
4. Imagen a 3D queda como experimento, no en el roadmap principal.

## B. Instrucciones visuales de armado

### Lo que existe

| Proyecto | Qué es | Licencia | Útil para Handy |
| --- | --- | --- | --- |
| [Nutlope/bygga](https://github.com/Nutlope/bygga) | Guías de montaje de 1 171 productos IKEA en 3D animado con estilo de manual (líneas) y voz. Next.js, React, three.js con motor de líneas propio (`src/engine`) y generadores paramétricos por familia (`src/lib/plan`: cama, estante, cajones, mesa...). 627 estrellas. | MIT | El **motor de render de líneas** y la idea de generar pasos desde un modelo paramétrico son el patrón a seguir. Sus generadores son a mano por familia; no hay esquema genérico de paso. |
| [prashaantr/ikea-assembly-instructions](https://github.com/prashaantr/ikea-assembly-instructions) | Skill para agentes que genera PDF de manual sin texto: portada, seguridad, inventario de herrajes y piezas, un paso por página, llamadas y flechas por tipo de acción. YAML de entrada con `parts`, `steps` (place, attach, insert, rotate, flip), render con drawsvg + reportlab. | sin licencia visible | El **esquema YAML y la estructura de páginas** son un buen punto de partida; no tiene coordenadas 3D (proyección 2D fija). |
| [gwyzzenn/ikea-style-manual](https://github.com/gwyzzenn/ikea-style-manual) | Skill que escribe un HTML autocontenido estilo manual para procesos, no para geometría. | MIT | Solo estilo visual. |
| [IKEA-Manual (Stanford)](https://cs.stanford.edu/~rcwang/projects/ikea_manual) y [IKEA Manuals at Work](https://github.com/yunongLiu1/IKEA-Manuals-at-Work) | Datasets académicos: 102 objetos con partes 3D, planes de ensamblaje y correspondencias 2D-3D. CC-BY-4.0 el segundo. | CC-BY-4.0 | Referencia para el **modelo de datos de un plan de ensamblaje** y para validar el orden automático. |
| Add-ons de Blender (Xplod GPL-3, Automatic Exploded Assembly, AssemblyLink Studio) | Vistas explotadas y guías paso a paso desde mallas. | GPL / pagos | Camino alternativo vía exportación glTF + Blender; no sirve dentro de Handy. |

### Decisión para Handy

Handy genera las instrucciones **desde el propio modelo**, sin dibujos a mano:

1. **Plan de ensamblaje automático** (`packages/assembly`): grafo de dependencias a partir de las juntas y herrajes (costados → piso/techo → fondo → correderas → cajones → frentes → unión de módulos → zócalo → cubierta → servicios → iluminación). Cada paso: piezas que entran, herrajes con cantidad, herramienta, movimiento de inserción (vector), ampliaciones (detalle de la excéntrica) y prohibiciones (sin martillo).
2. **Render de líneas** en three.js al estilo Bygga (bordes, sin sombreado, isométrica fija), con flechas y llamadas numeradas; el mismo motor sirve para la animación del paso y para el PDF.
3. **Salidas**: PDF A4 sin texto, HTML interactivo (como Bygga, con narración opcional) y vídeo corto por paso.
4. **Edición**: el orden automático se puede reordenar arrastrando; los pasos se guardan en el `.handy.json`.
5. Esquema de paso inspirado en el YAML de prashaantr y en el dataset de Stanford, pero con poses 3D reales.

Ver mock en `docs/mocks/Armado.html` y el módulo en [../modulos/armado.md](../modulos/armado.md).
