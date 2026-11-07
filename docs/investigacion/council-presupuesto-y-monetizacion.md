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
