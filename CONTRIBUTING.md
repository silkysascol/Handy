# Contribuir a Handy

Gracias por tu interés. Handy está en etapa de planificación, así que las contribuciones más valiosas hoy son ideas bien descritas, datos locales y código del motor.

## Principios

1. **Milímetros enteros** en todo el motor. Las conversiones viven en la interfaz.
2. **Local-first**: todo funciona sin internet salvo la búsqueda de precios. Los proyectos son archivos JSON legibles.
3. **Formatos abiertos**: STL, 3MF, glTF, DXF, CSV, PDF. Nada propietario.
4. **Región-agnóstico**: las medidas estándar, normativas y tiendas se cargan desde datos por país, nunca se hardcodean.
5. **La IA es copiloto, no caja negra**: cada propuesta del asistente debe explicar por qué (regla, norma o criterio estético).

## Flujo

- Abre un issue antes de un cambio grande; usa las plantillas.
- Ramas: `feat/...`, `fix/...`, `docs/...`.
- `pnpm build && pnpm typecheck && pnpm test` deben pasar.
- Documenta decisiones de arquitectura como ADR en `docs/decisiones/` (copia el formato de las existentes).

## Dónde ayuda más

| Área | Qué aportar |
| --- | --- |
| Catálogos | Un `catalog-<pais>.json` con precios reales de tableros, tapacantos y herrajes, con fecha y tienda. |
| Normativas | Alturas de enchufes, reglas de tuberías, etc. de tu país con la fuente (norma o manual). |
| Generadores | Nuevos tipos de mueble (`packages/core/src/generators/`): cajonera, escritorio, módulo de cocina alto. |
| Repuestos 3D | Piezas paramétricas con tolerancias probadas en impresora. |
| Adaptadores de tienda | Implementaciones de `PriceProvider` para tiendas locales con API o scraping responsable. |

## Código de conducta

Sé amable, asume buena fe y da contexto. Nada más.
