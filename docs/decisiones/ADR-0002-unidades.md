# ADR-0002: Milímetros enteros como unidad interna

**Estado**: aceptada · **Fecha**: 2026-11-05

## Contexto

Mezclar cm, m, pulgadas y decimales produce errores acumulados en listas de corte y perforados.

## Decisión

Todo el motor usa **milímetros enteros**. Las conversiones (`cmToMm`, `inchToMm`, ...) existen solo en la frontera con la UI o las importaciones. Las áreas se reportan en m² con 3 decimales; los metros de tapacanto con 2.

## Consecuencias

- Las importaciones (RoomPlan en metros, STL en mm, pulgadas en EE. UU.) se normalizan al entrar.
- Los espesores sub-milimétricos (tapacanto 0,45 mm) se guardan como `thickness` decimal en el material, pero no afectan medidas de piezas (decisión pendiente, ver muebles.md).
