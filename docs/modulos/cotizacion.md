# Módulo: Cotización en tiempo real

## Objetivo

Mientras el mueble cambia, Handy recalcula materiales y busca precios en tiendas locales para mostrar un costo aproximado, siempre con tienda, fecha y faltantes visibles.

## Cómo funciona hoy

1. `buildCutlist()` produce m² por material y metros de tapacanto.
2. `buildQuote()` consulta la lista de `PriceProvider` y toma la oferta más barata por categoría.
3. Tableros se cotizan por formato completo con factor de desperdicio (15 % por defecto). Herrajes por unidad o paquete.
4. Cada línea guarda la oferta original (tienda, URL, fecha). Lo que no se encuentra queda marcado como faltante, nunca inventado.

## Interfaz de proveedor

```ts
interface PriceProvider {
  id: string; name: string; region: string;
  search(query: ProductQuery): Promise<PriceOffer[]>;
}
```

Consultas por categoría normalizada (`board`, `edgeband`, `hinge`, `cam-lock`, `slide`, ...), espesor, acabado y región.

## Tipos de proveedor previstos

| Tipo | Ejemplo | Ventajas | Riesgos |
| --- | --- | --- | --- |
| Catálogo JSON (hecho) | `catalog-ejemplo.json`, lista propia del taller | offline, confiable, controlado por el usuario | se desactualiza |
| Lista pegada / importada | CSV del distribuidor de tableros | rápido de cargar | formato variable |
| API oficial o feed | tiendas con API pública, afiliados | estable, legal | pocas tiendas lo ofrecen |
| Scraper responsable | ferreterías y home centers | cobertura amplia | términos de uso, cambios de HTML, bloqueos |
| Comunidad | catálogos compartidos por país en el repo | escala | requiere moderación |

Scraping: solo con respeto a `robots.txt`, caché local (24 h), tasa baja, y como plugin opcional que el usuario activa. Preferir API o importación manual cuando exista.

## Tiendas candidatas por país (a validar)

- Chile: Sodimac/Homecenter, Easy, Imperial, Masisa Placacentro, Construmart.
- Colombia: Homecenter, Madecentro, Easy, Duratex, Tablemac (prioridad inicial del proyecto).
- Argentina: Easy, Sodimac, Masisa Placacentro, distribuidores de Faplac/Egger.
- Perú: Sodimac, Promart, Maestro.
- México: Home Depot, Lowe's, Madecentro.
- España: Leroy Merlin, Bricomart, Bauhaus.
- Brasil: Leroy Merlin, Leo Madeiras, Telhanorte.

Cada país tendrá `packages/providers-<cc>` y un `catalog-<cc>.json` comunitario.

## Tiendas cercanas y conocidas

El usuario fija su ubicación (o la del proyecto) y Handy prioriza tiendas **cercanas** (radio configurable, p.ej. 10 km) y **conocidas** que el usuario marca como favoritas, por ejemplo Homecenter y Madecentro en Colombia. Cada oferta guarda la sucursal, la distancia y la hora de consulta. La cotización calcula tres vistas: mezcla óptima entre tiendas, todo en una sola tienda (un viaje) y catálogo propio. Ver mock en `docs/mocks/Comparativa.html`.

## Qué muestra la UI

- Subtotal por categoría (tableros, cantos, herrajes, extras), moneda local.
- Antigüedad del precio más viejo.
- Toggle "incluir corte y enchapado del aserradero" con precio por corte/metro.
- Comparativa entre tiendas y entre decorados ("en Roble sube 30 %").

## Preguntas abiertas

- ¿Normalización de nombres de decorados entre fabricantes (Masisa, Arauco, Egger, Duratex)?
- Impuestos: precios con o sin IVA según país.
- Optimización de corte real para reducir tableros estimados (hoy solo área + desperdicio).
