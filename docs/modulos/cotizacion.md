# Módulo: Cotización en tiempo real

## Objetivo

Mientras el mueble cambia, Handy recalcula materiales y busca precios en tiendas locales para mostrar un costo aproximado, siempre con tienda, fecha y faltantes visibles.

## Precios reales: tu libro de precios

Handy no consulta tiendas por su cuenta. Los precios reales los pones tú o tu IA, y quedan anotados con tienda, enlace y fecha en `precios.json`, junto al archivo de tu mundo (o donde diga `HANDY_PRICES`).

- **Escribiendo en el visor**, con cualquier cosa seleccionada:
  - `precio melamina 18 blanco 185.000 en Madecentro`
  - `la bisagra vale 4.500 en Homecenter`
  - `precio tornillo fondo 9.000 caja de 100 en Homecenter`
  - `precio porcelanato 60 x 60 89.900 caja de 4 en Homecenter`
  - `quita el precio de la bisagra en Madecentro`
  - `¿cuánto cuesta?`
- **Con tu IA**, por MCP: `prices_needed` le dice qué renglones faltan y con qué clave; ella los busca en Homecenter, Madecentro o donde compres, con sus propias herramientas de búsqueda, y los anota con `price_set`. El botón "Copiar lista de precios para mi IA" del resumen arma ese pedido.

Reglas:

1. **Con el primer precio propio, el presupuesto deja de usar el catálogo de ejemplo.** Lo que no tenga precio sale como faltante. Nunca se mezclan dólares de ejemplo con pesos reales.
2. El renglón se busca por sus palabras entre los del presupuesto actual. Si hay varios que coinciden, Handy pide más detalle; si no hay ninguno, lista los que hay.
3. Medidas no son plata: en "tubo 40x40 cuesta 62 mil", el precio es 62.000.
4. Si la tienda vende por caja, rollo o paquete, Handy calcula cuántos comprar. Entre tiendas gana la más barata **por unidad** (o por pieza, en baldosas).
5. Un precio anotado para un herraje concreto no se aplica a otros de su categoría.
6. Anotar otra vez el mismo producto en la misma tienda actualiza el precio y la fecha.
7. Un precio con más de 30 días se marca como viejo.

El resumen del precio (al pasar el mouse) muestra de qué tienda sale cada renglón, el total **por tienda** para saber qué comprar en cada una, los faltantes y los precios viejos.

Límites: no hay impuestos ni transporte, no se comparan sucursales, y un precio sirve a todos los renglones con las mismas características (espesor y acabado en tableros; material y formato en pisos; perfil en tubos).

## Cómo funciona hoy

1. `buildCutlist()` produce m² por material y metros de tapacanto.
2. `buildQuote()` consulta la lista de `PriceProvider` y toma la oferta más barata por unidad. `activeProviders(libro, otros)` pone primero el libro de precios propio y aparta los catálogos de ejemplo.
3. Tableros se cotizan por tableros enteros según el plano de corte. Cantos por metro o rollo. Herrajes por unidad o paquete. Perfiles por barra de 6 m.
4. Cada línea guarda la oferta original (tienda, URL, fecha) y su `need`: lo que haría falta para ponerle precio. Lo que no se encuentra queda marcado como faltante, nunca inventado.

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
| Libro de precios propio (hecho) | `precios.json`, anotado a mano o por la IA del usuario | precios reales con tienda, enlace y fecha; sin scraping | hay que mantenerlo al día |
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
- Importar una lista de precios desde un CSV o una factura.
- Impuestos y transporte por tienda.
