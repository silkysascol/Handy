# ADR-0004: Precios honestos, comisiones declaradas y ranking independiente

**Estado**: aceptada · **Fecha**: 2026-11-06

## Contexto

Handy cotiza con precios de tiendas y puede, en el futuro, recibir comisiones por afiliación o derivar pedidos. El council (ver `docs/investigacion/council-presupuesto-y-monetizacion.md`) coincidió en que la confianza del taller depende de que el precio mostrado no esté sesgado.

## Decisión

1. El orden de las ofertas y la "mezcla óptima" se calculan solo por precio, distancia, stock y antigüedad del dato. Nunca por comisión.
2. Si una tienda paga comisión a Handy, se declara en la línea de la cotización y en el enlace.
3. Handy nunca inventa un precio: lo que no se encuentra queda marcado como faltante y una propuesta con faltantes no se etiqueta "dentro de presupuesto".
4. La monetización (afiliados, pedidos, planes) vive fuera de `packages/core` y del servidor MCP base, como plugins o servicios aparte, para que el núcleo MIT siga siendo neutral.
5. El scraping de tiendas no forma parte del repositorio principal; los proveedores oficiales (API, afiliados, catálogos del usuario y de la comunidad) tienen prioridad.

## Consecuencias

Menos ingreso por afiliación del que daría un ranking sesgado, a cambio de que talleres y profesionales usen la cotización como referencia creíble. Los forks pueden quitar la comisión; lo que sostiene el negocio es el servicio, los datos frescos y la marca.
