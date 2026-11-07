# Council: diseño por presupuesto con IA y monetización

Fecha: 2026-11-06. Cinco perspectivas evaluaron en paralelo dos propuestas del fundador: (A) que la IA desarrolle una propuesta de mueble o renovación dentro de un presupuesto, con el contexto del espacio y las herramientas de Handy; (B) monetizar comisionando pedidos de materiales hechos desde la herramienta. Roles: taller de melamina en Cali, arquitecta interiorista, ingeniero de producto IA, estratega de negocio, abogado y comunidad open source. Abajo, lo que acordaron, lo que discutieron y lo que Handy decide.

## Propuesta A: "renueva esta cocina con 6 millones"

### Acuerdos (los cinco)

1. **Es el momento mágico del producto, solo si el resultado es comprable.** No un render: lista de corte, herrajes, tienda, sucursal y fecha de cada precio. Una imagen sin cotización es una demo más.
2. **Nunca una propuesta: siempre tres variantes** (mínima, base, aspiracional) con tabla de sacrificios explícita: "para caber en el presupuesto se quitaron 2 cajones y las correderas soft-close". El cliente debe saberlo antes, no descubrirlo en obra.
3. **El presupuesto no es solo material.** Una cocina incluye mesón, lavaplatos, corte y enchapado del aserradero, transporte, mano de obra e imprevistos (10–15 %). Si Handy cotiza 3,8 millones de tableros y el taller cobra 6, deja un cliente peleando. Debe haber renglones editables de mano de obra, obra gris y margen por país.
4. **Lo que la IA no decide sola** (lista negra en el motor, no en el prompt): quitar o mover muros, desplazar bajantes y gas, tocar tablero o circuitos, cambiar la ventilación de la campana. Esas acciones solo aparecen como "requiere profesional". Colorimetría y decorado se proponen como opción, no se imponen.
5. **Supuestos declarados**: cada propuesta dice "asumo muro a plomo, piso nivelado, bajante donde está" y pide una ficha de verificación en sitio antes de la lista de corte definitiva. Holguras de ajuste (tapaluz, rellenos) se suman al material.
6. **Trazabilidad**: en el `.handy.json` queda qué calculó el motor (versión, hipótesis, catálogo, fecha de precios) y qué texto generó el modelo (modelo, prompt, hash), separados visualmente como "calculado" y "sugerido por IA".
7. **Modo taller**: precios de distribuidor, tarifa por módulo y margen propios; el cliente final nunca ve el costo de materiales desnudo. Sin esto los talleres no adoptan la herramienta.

### Diseño técnico (ingeniero de IA, con acuerdo del resto)

- **El motor hace lo determinista; la IA interpreta y explica.** Geometría, lista de corte, precios, colisiones, normas y el ajuste al presupuesto son del motor. La IA interpreta la intención, elige el programa (qué módulos, prioridades) y redacta citando SKU, tienda y fecha.
- **Bucle en una pasada**, no treinta turnos: contexto del espacio → restricciones (tramos libres, fregadero sobre desagüe, estufa junto al gas, presupuesto) → la IA fija el programa → el motor compone módulos estándar → cotización del proyecto completo → validaciones, colisiones con obstáculos del espacio, esfuerzos → `fit_to_budget` en el motor con degradaciones ordenadas (decorado a blanco, correderas ocultas a telescópicas, altos a repisas abiertas, menos módulos) → la IA explica.
- **Herramientas MCP que faltan**: `get_space_context`, `layout_kitchen`, `quote_project` (cotización consolidada: hoy `buildQuote` es por mueble y duplica desperdicio), `fit_to_budget`, `compare_variants`, más `services` y `analyze_structure` ya previstas.
- **Anti-alucinación**: ninguna herramienta acepta precios como entrada; toda cifra del texto final debe mapear a un SKU del resultado estructurado o se descarta; si faltan precios la propuesta se etiqueta "incompleta", nunca "dentro de presupuesto". Mantener la regla "faltante, nunca inventado".
- **Costo y latencia**: 0,15–0,35 USD por propuesta con Opus, 0,08–0,18 con Sonnet, con caché de precios de 24 h y contexto cacheado; 30–90 s si el ajuste al presupuesto vive en el motor.
- **Evaluación**: 20–30 proyectos de prueba (lineal, en L, con ventana, con columna, con lavavajillas, por presupuesto bajo/medio/alto) con catálogo congelado; métricas: subtotal dentro del presupuesto sin faltantes, cero colisiones, cero errores, servicios cubiertos, 100 % de cifras citadas coinciden, tokens y latencia, rúbrica humana.

### Cosas que nadie había pensado

- Nesting real por formato de tablero en vez de m² con 15 % (el taller ha tenido que comprar un tablero más a última hora).
- Tablero RH bajo el fregadero y plan B si el decorado no está en la sucursal.
- Historial de versiones de cotización con diferencia de precio entre versiones; cambios firmados por cliente, IA o estudio para usar el proyecto como anexo de contrato.
- El hábito vive en el taller, no en el hogar: el usuario final renueva cada 7 años. Diseñar A como adquisición (compartible por WhatsApp) y el flujo de taller como retención.

## Propuesta B: comisión por pedidos desde la herramienta

### Veredicto compartido: débil como ingreso principal, viable como complemento declarado

- **Números** (estratega): afiliados de Falabella/Sodimac pagan 1–4 % y construcción está en la banda baja; en melamina el margen retail es 15–25 % y nadie cede más de 2–3 %. Ticket típico de materiales por mueble ~1,2 millones COP → 2 % son ~24.000 COP (~6 USD). Para 5.000 USD al mes harían falta ~850 compras atribuidas al mes. Easy salió de Colombia; quitarlo de la prioridad.
- **El taller no compra por un enlace** (carpintero): tiene cupo de crédito a 30 días y precio de taller 10–20 % bajo el público; pide corte y enchapado en mostrador con su despiece, revisando veta y lote; Homecenter corta pero no enchapa.
- **Confianza** (arquitecta, ingeniero, abogado): si Handy gana comisión, la "mezcla óptima entre tiendas" queda bajo sospecha. Condición dura: el ranking nunca depende de la comisión y la comisión se declara por línea en la interfaz. Sin eso es publicidad encubierta ante SIC o SERNAC.
- **Legal** (abogado): Homecenter, Madecentro y Easy prohíben la extracción automatizada en sus términos; cobrar comisión sobre datos raspados agrava el riesgo. El scraping queda como plugin externo del usuario; priorizar API o afiliados oficiales. MIT y comisiones son compatibles; cualquier fork puede quitar el ID de afiliado y ninguna licencia lo impide: lo que defiende el ingreso es la marca, los datos frescos y el servicio.
- **Técnica** (ingeniero): sin API de carrito, lo realista es lista de compra exportable con enlaces rastreados; `OrderIntent` en el proyecto y un `OrderProvider` paralelo a `PriceProvider`, fuera del núcleo MIT.

### Modelos alternativos y complementarios

| Modelo | Quién paga | Precio aprox. | Dificultad | Quién lo propuso |
| --- | --- | --- | --- | --- |
| **Plan Taller**: cotización en PDF con logo y precios propios, modo taller, historial de versiones, despiece en el formato del aserradero, nesting, vista 3D para aprobar por WhatsApp | taller | 20–35 USD/mes (el carpintero pagaría 30–60 mil COP) | media | taller, estratega, arquitecta |
| **Handy Cloud**: precios actualizados, IA incluida, sincronización | maker, taller | 6–9 USD/mes | media | estratega, ingeniero |
| **Leads "quiero que me lo hagan"**: el casero diseña y Handy lo deriva a un taller | taller, instalador | 5–15 USD por lead o 5–8 % del proyecto | alta | taller (es la comisión que sí pagaría), estratega |
| **Widget "diseña y compra"** embebido en la tienda o placacentro | tienda, distribuidor | 500–3.000 USD/mes | alta, pero donde está el dinero | estratega |
| **Biblioteca premium**: herrajes STEP, decorados reales normalizados, exportación IFC/Revit, add-on Blender | profesionales | 29–49 USD | baja | arquitecta |
| Marketplace de modelos y catálogos | diseñadores | 20–30 % de comisión | media | estratega |
| Datos agregados de demanda (anonimizados) | fabricantes de tableros | 1.000–5.000 USD/mes | baja técnica, requiere volumen | estratega |
| Afiliados declarados como plugin | tienda | 1–3 % | media | todos, como complemento |

### Secuencia recomendada (18 meses)

- **Meses 0–6**: todo gratis y MIT, catálogos comunitarios, instrumentar métricas de la propuesta A. Meta: 300–500 talleres activos en Colombia.
- **Meses 6–12**: Plan Taller y Handy Cloud. Supuesto conservador: 10 % de conversión en talleres.
- **Meses 12–18**: piloto del widget con un placacentro o Madecentro usando el volumen de talleres como argumento; leads en Bogotá, Medellín y Cali.
- **Qué no hacer**: cerrar el motor o el MCP, scraping agresivo a Homecenter, vender materiales directamente (inventario, logística, garantías), hardware, cobrar a makers antes de tener talleres pagando.

## Decisiones para Handy

1. La propuesta A entra al roadmap como **fase M7 "Diseña con mi presupuesto"**, con el bucle y las herramientas descritas, después de la app web y el motor de cocina. Reglas duras: tres variantes, presupuesto completo con mano de obra editable, lista negra en el motor, supuestos declarados, trazabilidad, cifras citadas.
2. La visión cambia: "Handy muestra precios y puede referirte a tiendas con comisión declarada; el ranking nunca depende de la comisión". Nuevo ADR-0004.
3. Monetización en orden: Plan Taller → Handy Cloud → leads → widget B2B. Afiliados solo como plugin declarado. Nada de esto vive en `packages/core`.
4. Acciones legales y de gobernanza en 90 días: `DISCLAIMER.md`, `PRIVACY.md` (datos locales por defecto; ubicación y escaneos de vivienda son sensibles), DCO para contribuciones, pedir por escrito API o afiliado a Homecenter y Madecentro, búsqueda de anterioridad de la marca "Handy" (nombre genérico y ya usado; evaluar "Handy Build" u otro antes de la beta pública).
5. Catálogos comunitarios con autor, fecha, fuente y nivel de confianza, marcados en la interfaz como "dato de la comunidad, no verificado".

---

## Council (skill ECC, una ronda): ¿"Diseña con mi presupuesto" como función estrella y Plan Taller primero?

Ejecutado el 2026-11-07 con la skill `council` instalada en `.claude/skills/council/` (cuatro voces: Arquitecto en contexto, Escéptico, Pragmático y Crítico lanzados sin la conversación). Pregunta: ¿debe Handy construir "diseña con mi presupuesto" como función de IA principal justo después del editor web y el generador de cocina, y monetizar primero con un Plan Taller más un nivel cloud, dejando las comisiones por pedido como plugin declarado?

**Arquitecto (posición previa, la del roadmap M7):** sí a ambas; la función de presupuesto es el gancho y el Plan Taller la retención.
Razón: es lo que el council anterior de cinco perspectivas había concluido.

**Escéptico:** no. La función de presupuesto es para el usuario que no paga (dueño de casa, cada 7 años); el taller quiere cotizar en 5 minutos, no tres variantes de IA. Primero cotizador, PDF con marca, lista de corte y nesting vendidos en persona a 10 talleres, sin esperar al editor web completo.
Razón: el competidor real es el vendedor de Madecentro con Excel y 15 % de descuento que cotiza gratis en el mostrador; Handy gana si ayuda al taller a cerrar la venta con su cliente, y las comisiones por leads que el taller sí pagaría pueden valer más que la suscripción.

**Pragmático:** sí al Plan Taller primero, pero la función de presupuesto no va después del editor como estrella: entra como `fit_to_budget` determinista del motor dentro del Plan Taller, y la versión "tres variantes con IA" espera a tener 10 talleres pagando.
Razón: cinco de los seis prerrequisitos de la función son del motor y sirven al taller igual; la capa de IA es la última y la más barata de añadir. Puede lanzarse hoy vía MCP para los primeros talleres sin app web.

**Crítico:** no. Es un espejismo para un solo fundador: la cotización fiable a nivel proyecto está sin resolver y es justo lo que el taller también necesita. El motor hoy es un generador y un catálogo estático; nesting es un problema no trivial; los precios de taller no se pueden raspar, se ingresan a mano.
Razón: el error dominante no es que la IA invente, sino que el SKU exista con precio vencido o de otra ciudad; sin fecha visible y tolerancia declarada, el reclamo llega cuando el cliente va a Homecenter con la cotización en la mano.

### Veredicto

- **Consenso:** las tres voces externas coinciden contra la posición inicial: el Plan Taller (cotización por proyecto, PDF con marca, precios propios ingresados a mano, lista de corte, nesting) va antes que el editor web completo y antes que la IA; `fit_to_budget` se construye determinista en el motor y sirve a ambos; las comisiones por pedido no son negocio.
- **Disenso más fuerte:** el Escéptico sostiene que las comisiones por leads ("hazlo por mí") pueden valer más que la suscripción y que tratarlas como plugin opcional regala el canal. El Pragmático y el Crítico no lo contradicen pero priorizan la suscripción por ser dinero inmediato.
- **Chequeo de premisa:** sí. El Escéptico cuestiona que la función de presupuesto sea para quien paga, y el Crítico cuestiona que "cotización en tiempo real desde tiendas" exista hoy. Ambas objeciones son válidas.
- **Recomendación (cambia la del roadmap):** reordenar. (1) Cotización por proyecto con precios propios del taller y fecha visible, PDF con marca, lista de corte y nesting, entregados primero vía MCP y CLI y luego en una web mínima; vender en persona a 10 talleres y conseguir 5 compromisos de pago antes de construir el editor completo. (2) `fit_to_budget` determinista en el motor como parte de ese paquete. (3) La función "tres variantes con IA" se lanza cuando haya talleres pagando, con mano de obra, mesón e instalación como renglones editables y con fecha y tolerancia de cada precio visibles. (4) Leads a talleres se exploran desde el inicio como canal, no como plugin tardío. Se mantiene: afiliados solo declarados y fuera del núcleo (ADR-0004).

---

## Council (skill ECC): con la visión correcta, Handy para quien lo hace él mismo

Ejecutado el 2026-11-07. Corrección del fundador: los dos councils anteriores evaluaron un Handy para talleres. Handy es para la **persona que hace las cosas por sí misma**: manda a cortar en la tienda, arma en casa, conecta **su propia IA** (su suscripción, Handy no paga IA). Promesa: mueble tipo IKEA sin tornillos a la vista ni perforaciones milimétricas, costos reales de cocina y piso, cuánta pega y boquilla, cajón o tapa con pistón. Pregunta: ¿qué construir primero para ese usuario y cómo sostener el proyecto sin traicionarlo?

**Arquitecto (posición previa):** con el usuario correcto, "diseña con mi presupuesto" vuelve a ser central; construir la web con el flujo de Muebles y la cotización, y el estudio de pisos pronto porque es lo que ese usuario pregunta; sostener con donaciones, nivel cloud de precios frescos y afiliados declarados.

**Escéptico:** primero el **closet o estantería sin tornillos visibles como flujo completo**: medidas → despiece listo para Madecentro → plantilla de perforado → instrucciones de armado. Nada de cocinas, pisos ni "diseña con mi presupuesto" hasta que 50 personas reales hayan terminado un mueble.
Razón: la cocina es el proyecto menos frecuente, de mayor riesgo (mesón, plomería, electricidad) y donde un fracaso quema la marca; el closet se hace varias veces al año y es donde IKEA convence. El activo monetizable que nadie más tiene es la **plantilla física de perforado** (jig de 15 mm y guía de tarugos) vendida a 30–60 mil COP.

**Pragmático:** el mismo flujo de closet/estantería de punta a punta, con presupuesto completo con contingencia y PDF de armado; nada de cocinas ni pisos en seis meses. Financiar con donaciones, **plantillas de perforado impresas vendidas como producto físico** y afiliados declarados como secundario.
Razón: el motor ya existe y lo que falta es el último kilómetro, una web que un humano sin terminal pueda usar; miles de closets terminados dan más prueba social que diez cocinas. El éxito se mide en la caja de la tienda: si la lista de corte no entra en el formato exacto del operario de la sierra, el usuario fracasa antes de abrir el diseño.

**Crítico:** empezar por el estante o closet simple con instrucciones y plantillas **verificadas en una sola ciudad**; la cocina con IA primero es el mayor riesgo. Monetizar con cloud de precios frescos y leads declarados, nunca catálogos premium.
Razón: el cuello de botella no es el software sino la física (cam locks a 15 mm, tarugos con plantilla, CNC "según ciudad"). Y "trae tu propia IA" tiene un costo oculto: Handy no controla la calidad de la salida; un modelo local débil dará diseños peores y el usuario culpará a Handy. La capa determinista debe ser tan estricta que la IA solo elija entre opciones válidas.

### Veredicto

- **Consenso (las tres voces, contra mi posición inicial):** el primer producto es un solo flujo completo, **closet o estantería sin tornillos a la vista**, desde las medidas hasta el mueble armado, validado con personas reales en una ciudad antes de ampliar. La cocina, los pisos y la IA de presupuesto esperan. La web mínima conecta lo que el motor ya hace. Cambio mi recomendación: la señal de dos o más voces alineadas es real, y aquí son tres.
- **Disenso más fuerte:** la monetización. Escéptico y Pragmático apuestan por un **producto físico** (plantilla de perforado y guía de tarugos) y descartan leads; el Crítico prefiere cloud de precios y leads y descarta catálogos premium. Nadie defiende afiliados como eje.
- **Chequeo de premisa:** sí, en dos puntos. El Escéptico y el Crítico cuestionan que la cocina sea el primer caso aunque sea el que más duele en costo; y el Crítico cuestiona que "trae tu propia IA" sea gratis: traslada a Handy la responsabilidad de validar lo que una IA ajena propone.
- **Recomendación:**
  1. **M1 = "mi primer closet"**: generador de closet y estantería, sistema de unión según herramientas con perforación en la tienda o plantilla impresa, despiece en el formato exacto de Madecentro y Homecenter (ir a la tienda y validarlo con el operario antes de escribir más 3D), presupuesto completo con reserva, instrucciones de armado en PDF, todo en una web mínima. Probar con 5 personas sin experiencia, taladro de mano y plantilla, en una ciudad.
  2. **Validación dura**: sin validación verde del motor no hay lista de corte, venga la propuesta de la IA que venga. La IA elige entre opciones válidas, nunca inventa medidas.
  3. **Después**: cocina (con mesón, servicios y electrodomésticos), pisos y enchapes, y "diseña con mi presupuesto", en ese orden, cuando 50 personas hayan terminado un mueble.
  4. **Sostenimiento**: donaciones y patrocinio desde el día uno; **plantilla física de perforado** como primer producto pago (pequeña, tangible, resuelve el dolor real, no cobra por la IA del usuario); cloud de precios frescos solo cuando haya cómo mantener los datos; afiliados declarados como secundario; leads a talleres con cuidado, porque crean el incentivo de que el usuario se rinda.
