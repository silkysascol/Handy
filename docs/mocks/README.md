# Mocks de UI/UX

Cuatro pantallas estáticas en HTML (abrir en el navegador) que fijan la dirección de la interfaz. El lienzo editable vive en el artefacto de Claude "Handy UI Mocks".

| Archivo | Pantalla | Qué muestra |
| --- | --- | --- |
| `Main.html` | Muebles | Parámetros a la izquierda, visor 3D con arrastre de caras al centro, **cotización en vivo** a la derecha con tienda y antigüedad por ítem, "qué pasa si…", avisos de diseño y esfuerzos, barra de comandos (MCP). |
| `Espacios.html` | Espacios | Mapa 2D con muros de distinto grosor, puertas con barrido, ventanas, recintos con área, puntos eléctricos y **canalización probable** por nivel de confianza, inspector del muro, eléctrica (RETIE) y estudio solar. |
| `Objetos.html` | Objetos | Biblioteca de piezas sugeridas desde el proyecto, vista previa del soporte de repisa con cotas y tolerancias, imprimibilidad, costo de filamento vs. comprarlo, export STL/3MF/glTF. |
| `Comparativa.html` | Cotización | Mezcla óptima entre tiendas, todo en una tienda, catálogo propio; tabla ítem por ítem (Homecenter, Madecentro, Easy, mi catálogo), servicios opcionales y qué cambia el total. |

## Decisiones de diseño

- **Tres secciones siempre visibles** en la barra superior: Espacios, Muebles, Objetos. El proyecto es el mismo en las tres.
- **La cotización es un panel permanente**, no una pantalla aparte: cambia con cada arrastre o comando. Cada línea muestra tienda, distancia y hace cuánto se tomó el precio; lo que no tiene precio se marca, nunca se inventa.
- **Tiendas cercanas o conocidas** (Homecenter, Madecentro, Easy en Colombia) más el catálogo propio; la mezcla óptima reparte la compra entre tiendas.
- **Milímetros en monoespaciada** (JetBrains Mono) para que las cifras se alineen; texto en Manrope. Acento ámbar (madera) y verde azulado para estados positivos, ámbar oscuro para avisos.
- **Comandos en lenguaje natural** en las tres secciones, resueltos localmente o por la IA conectada vía MCP.
- Los precios de los mocks son ilustrativos.
