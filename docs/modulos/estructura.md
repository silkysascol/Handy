# Módulo: Simulación de esfuerzos y viabilidad

Transversal a Espacios, Muebles y Objetos. Responde "¿esto aguanta?" con cálculo simplificado, honesto sobre sus límites.

## Alcance

| Nivel | Qué calcula | Método | Fase |
| --- | --- | --- | --- |
| 1. Analítico | Flecha y tensión de repisas, cubiertas y vigas; pandeo de costados y patas; aplastamiento de ladrillo; capacidad de tarugos/tornillos | Fórmulas de resistencia de materiales (Euler-Bernoulli, Euler para pandeo) con factores de seguridad | M1 |
| 2. Elementos finitos ligero | Muebles completos y pórticos simples: deformada, mapa de tensiones por color, punto de fallo probable | Método de rigidez (vigas/placas) en TypeScript; WASM si se vuelve lento | M5 |
| 3. Espacios | Viabilidad preliminar de luces de vigas y losas, aberturas en muros, cargas sobre muros de ladrillo, mezanines | Tablas de predimensionado + nivel 2 | M5–M6 |

## Entradas

- Materiales con propiedades: módulo elástico, resistencia a flexión/compresión, densidad. Valores iniciales para melamina/aglomerado, MDF, contrachapado, pino, roble, ladrillo cerámico, hormigón, acero.
- Cargas típicas predefinidas: libros (60 kg/m²), ropa colgada (15 kg/m), TV (30 kg puntual), persona (100 kg), mesón de cocina (50 kg/m²), nieve/viento para asadores exteriores.
- Apoyos deducidos del modelo: repisa sobre soportes, costado apoyado en piso, cubierta sobre costados.

## Salidas

- Flecha máxima (mm) comparada con el límite (L/200 para muebles, L/300 para cubiertas); tensión vs. admisible.
- Semáforo por pieza (ok / ajustado / falla) y mapa de color sobre el modelo 3D.
- Sugerencias accionables: "aumenta a 25 mm", "agrega un divisor a 600 mm", "cambia a tablero contrachapado", "dintel de ángulo 50x50x5".
- Informe exportable con hipótesis, fórmulas y factores usados.

## Límites y aviso

Handy hace cálculos preliminares con hipótesis simplificadas. Para estructuras habitables (vigas, losas, demolición de muros, mezanines) los resultados son orientativos y deben ser verificados por un ingeniero. Cada informe lo dice y lista las hipótesis.

## Preguntas abiertas

- Propiedades reales de melaminas comerciales varían por fabricante; recopilar fichas técnicas.
- Uniones: rigidez de una unión minifix vs. confirmat para el modelo de pórtico.
