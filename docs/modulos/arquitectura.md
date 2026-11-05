# Módulo: Arquitectura doméstica

Tres capas: eléctrica, sanitaria y solar. Todas con datos por país y fuente citada. Handy orienta; la instalación la certifica un profesional.

## 1. Eléctrica: alturas y ubicaciones estándar

Valores habituales de referencia (verificar con la norma local; se guardarán en `data/electrical/<cc>.json` con fuente):

| Elemento | Altura al eje (mm) | Observaciones |
| --- | --- | --- |
| Enchufe general | 300–400 | Algunos países 200–300. |
| Interruptor | 1100–1200 | Junto a la puerta, lado de la manilla, 100–150 mm del marco. |
| Enchufe sobre mesón de cocina | 1100–1200 | Mesón a 900, salpicadero libre. |
| Enchufe campana | 1800–2000 | Según modelo. |
| Enchufe refrigerador / horno | 300–400 / 600–700 | Detrás o lateral accesible. |
| Enchufe lavadora | 1100–1300 | Zona húmeda: con protección diferencial. |
| Enchufe baño | ≥ 600 del borde de tina/ducha; 1100–1200 | Distancias según norma (NEC, REBT, NCh Elec 4/2003, RETIE, AEA). |
| Enchufe cabecera de cama | 600–700 | Para veladores; o 300 si va bajo el velador. |
| TV en pared | 1000–1300 | Según altura de montaje. |
| Tablero eléctrico | 1500–1800 al borde superior | Accesible, fuera de baño/cocina. |

Funciones: capa de puntos eléctricos sobre el plano/espacio, conteo por tipo para cotizar, aviso de enchufes tapados por muebles, sugerencia de puntos faltantes por recinto (p.ej. mínimo de enchufes por metro de pared según norma) e inferencia de canalización y circuitos con nivel de confianza (ver [espacios.md](espacios.md)).

## 2. Sanitaria: reglas de tuberías

| Regla | Valor de referencia |
| --- | --- |
| Pendiente desagüe Ø 50–75 mm | 2 % (mín. 1,5 %) |
| Pendiente desagüe Ø 100–110 mm | 1 % (mín.), 2 % recomendado |
| Diámetro WC | 100–110 mm |
| Diámetro lavatorio / lavaplatos | 40–50 mm |
| Diámetro ducha / tina | 50 mm |
| Sifón | obligatorio en cada aparato; altura cierre hidráulico ≥ 50 mm |
| Ventilación | columna ≥ 50–75 mm, salida sobre cubierta |
| Agua fría/caliente | 1/2" (13–16 mm) ramales, 3/4" (20 mm) alimentación |
| Altura salida agua lavatorio | 550–600 mm; ducha mezcladora 1000–1100; monomando tina 700 |
| Altura desagüe lavatorio | 500–550 mm; WC salida a piso a 300–305 mm de la pared (rough-in 12") |

Funciones: trazar desagües desde aparatos hasta la bajada con cálculo de pendiente y aviso si falta altura; lista de materiales (tubos, codos, tees, sifones) para cotizar; posicionar aparatos con sus distancias mínimas (WC: 700–800 mm de ancho libre).

## 3. Luz solar

Entradas: latitud, longitud, fecha, hora, orientación del norte del espacio y geometría de ventanas/paredes.

Cálculo: algoritmo de posición solar (NOAA/SPA) → azimut y elevación. Con ellos:

- Sombra proyectada de paredes y muebles en el visor (luz direccional en Three.js).
- Trayectoria solar del día y del año sobre la planta (diagrama).
- Horas de sol directo por fachada y por ventana para solsticios y equinoccios.
- Mancha de sol sobre el piso a una hora dada: útil para decidir dónde va el escritorio, la cama o dónde evitar el sol en pantallas.
- Clasificación de orientación (N/S/E/O) con consejos por hemisferio.

Más adelante: obstrucciones externas (edificios vecinos) desde un croquis o altura aproximada; aleros y cortasoles.

## Datos por país

`packages/arch/data/<cc>/electrical.json`, `plumbing.json`, con campos `value`, `unit`, `source`, `note`. Las contribuciones deben citar norma o manual.

## Preguntas abiertas

- Qué tan lejos ir en normativa: un subconjunto de reglas prácticas por país es más realista que la norma completa.
- Mostrar valores con rango y "fuente" en la UI para no inducir a error.
