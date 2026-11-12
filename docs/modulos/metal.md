# Módulo: Estructuras en perfiles de acero y similares

> Primera versión hecha: `packages/core/src/profiles.ts`, `generators/frame.ts` y `barcut.ts`. Mesa o base y estantería en tubo cuadrado de 20 a 50 mm, con cubierta o entrepaños de tablero, soldada o atornillada; despiece lineal en barras de 6 m, peso, consumibles, cotización, avisos de travesaño largo y de vuelco. En el visor: selecciona un muro y escribe "mesa de tubo de 120 x 75 x 60". Pendiente: ángulo, platina, rectangular y aluminio; ingletes; marcos sueltos, pérgolas y bastidores de drywall; cálculo de flecha real.

Parte de la sección Muebles (y de Espacios cuando la estructura es de obra). Cubre lo que se arma con barras: bases de mesa, estanterías industriales, marcos de cama, estructura de mesones y de asadores, pérgolas, rejas, soportes, y la perfilería liviana de drywall.

## Materiales

| Familia | Ejemplos | Barra comercial | Unión típica |
| --- | --- | --- | --- |
| Tubo estructural cuadrado y rectangular | 20x20, 25x25, 40x40, 50x25, 40x80; calibres 18, 16, 14 | 6 m | soldadura, pernos, conectores |
| Ángulo y platina | 1" x 1/8", 1½" x 3/16"; platina 1" x 1/8" | 6 m | soldadura, pernos |
| Perfil C, canal, IPE/HEA | correas, vigas | 6 m o 12 m | soldadura, pernos; requiere ingeniero |
| Tubo redondo y varilla | 1", 1½"; varilla lisa y corrugada | 6 m | soldadura |
| Aluminio | perfil ranurado 20x20/40x40 (tipo V-slot), tubo, ángulo | 3 m o 6 m | escuadras y tornillos en T, remaches |
| Perfilería de drywall | canal y paral 2½" y 3⅝", omega, ángulo | 2,44 m o 3,05 m | tornillo autoperforante |

Catálogo por país en `packages/core/data/profiles-<cc>.json`: sección, espesor, peso por metro, inercia, largo comercial y precio por barra, con fuente.

## Qué hace Handy

- **Generadores paramétricos**: marco rectangular, base de mesa (4 patas con travesaños), estantería de marcos, banco, pérgola simple, bastidor de drywall (canales, parales cada 406 o 610 mm, refuerzos para colgar muebles). Cada barra es una pieza con su perfil, largo y cortes en los extremos (recto o a 45°).
- **Despiece lineal**: optimiza cómo cortar todas las piezas de las barras comerciales (6 m) considerando el ancho del disco (2–3 mm) y los ingletes, minimizando barras y sobrantes; plano de corte por barra y lista para llevar a la ferretería o al taller de corte.
- **Peso y costo**: kg por pieza y total, barras a comprar, precio por barra de tiendas cercanas, más consumibles: electrodos o alambre (kg por metro de cordón), discos de corte y pulido, anticorrosivo y pintura por m² de superficie, pernos y tapas plásticas para tubo.
- **Uniones según lo que el usuario sabe hacer**, igual que en madera:

| Lo que el usuario tiene | Sistema propuesto |
| --- | --- |
| No suelda | Conectores atornillados para tubo cuadrado, escuadras con pernos, tuercas remachables, o aluminio ranurado con escuadras |
| Suelda con electrodo o MIG | Uniones soldadas a tope o a inglete; Handy da el orden de punteo para no torcer el marco y la longitud de cordón |
| Manda a hacer | Plano con cotas, despiece y cantidades para el cerrajero |

- **Mixto madera y metal**: cubierta de melamina o madera sobre marco de tubo (platinas con agujeros ovalados para la dilatación), repisas sobre ángulos, mesón sobre estructura. La lista de corte y la cotización salen juntas.
- **Esfuerzos**: flecha y tensión de travesaños y vigas con las propiedades del perfil, pandeo de patas, estabilidad al vuelco de estanterías. Mismo módulo de [estructura.md](estructura.md), con semáforo por barra.
- **Instrucciones de armado**: orden de corte, punteo, escuadrado con diagonales, soldadura final, pulido y pintura; o el orden de atornillado para la versión sin soldar.

## Modelo de datos

```ts
interface ProfileSpec { id: string; family: "square-tube" | "rect-tube" | "angle" | "flat" | "channel" | "round-tube" | "alu-slot" | "drywall-stud" | "drywall-track"; a: number; b?: number; t: number; kgPerM: number; stockLength: number }
interface Bar { id: string; name: string; profileId: string; length: number; cutStart: 90 | 45; cutEnd: 90 | 45; qty: number; placement?: { from: [number, number, number]; to: [number, number, number]; roll?: number } }
interface FrameModel { id: string; name: string; bars: Bar[]; joints: { a: string; b: string; kind: "weld" | "bolt" | "connector" | "screw" }[]; panels?: Panel[]; hardware: HardwareItem[] }
```

## Límites

Estructuras que cargan personas o techos (mezanines, escaleras, cubiertas, vigas de entrepiso) quedan fuera del cálculo confiable: Handy dimensiona de forma preliminar, lo marca como "requiere ingeniero" y exporta el modelo. Soldar exige equipo de protección; las instrucciones lo recuerdan.

## Preguntas abiertas

- Nomenclatura por país (calibre vs espesor en mm, pulgadas vs mm).
- Catálogo inicial de conectores sin soldadura disponibles localmente.
