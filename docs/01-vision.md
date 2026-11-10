# Visión

## Qué es Handy: tu taller virtual

Handy es un entorno "meta": un **duplicado virtual de tus espacios** (tu casa, tu taller) donde vive todo lo que planeas. La casa está ahí con sus medidas reales, muros, puertas y ventanas; los muebles, los pisos y las estructuras se diseñan y se colocan **dentro de ese mismo espacio**.

Ese mundo es el contexto compartido entre tú y tu IA. En un chat la IA no ve tu cuarto, no recuerda medidas entre conversaciones y no puede comprobar si algo cabe. En Handy la IA lee el mundo, pregunta por los tramos libres de un muro, coloca un mueble, comprueba que la puerta abre sin chocar, cotiza y corrige, todo sobre el mismo modelo que tú ves. El mundo persiste en un archivo tuyo y cada conversación continúa donde quedó la anterior.

Nadie necesita saber modelar. Se **hace clic** en un muro, un mueble o una ventana y se **dice qué hacer** con palabras: "pon una puerta de 80 x 205 a 2 m de la pared izquierda", "ensancha 10 cm", "quítala". Todo se modifica así. Un intérprete local resuelve las órdenes comunes al instante y sin IA; lo que no entiende se lo pasa a la IA del usuario con la selección como contexto.

De ese mundo sale lo demás: el modelo para **Blender** cuando quieres renders, el **despiece** para quien corte la madera o el metal mientras no tengas tu propia herramienta, la lista de compras y las instrucciones de armado.

## Primero, una herramienta personal

Handy empieza como la herramienta con la que su autor hace sus propios trabajos. Cada función se prueba primero en un proyecto real suyo: si le sirve a él para diseñar, costear y armar, queda. Lo comercial se piensa después, con lo aprendido en esos proyectos. Hasta entonces no hay planes de pago, ni afiliados, ni producto físico: solo código abierto y uso propio.

## Para quién es Handy

Handy, como su nombre lo dice, es para la persona **que hace las cosas por sí misma**: manda a cortar los tableros en Madecentro u Homecenter, los trae a casa y arma su propia cocina, su closet o su biblioteca. No tiene formación en diseño de muebles ni en arquitectura, y no quiere tenerla. Quiere que el resultado se vea bien, funcione y le cueste lo que calculó.

También sirve a talleres, makers y arquitectos, pero el producto se diseña primero para el usuario promedio.

## La promesa

1. **Subir el nivel del producto final.** Muebles tipo IKEA: piezas que llegan cortadas y enchapadas, se arman sin tornillos a la vista y **sin perforaciones milimétricas** hechas a mano. Handy elige el sistema de unión según lo que el usuario puede hacer y lo que ofrece la tienda (corte, enchape, perforación CNC), y cuando hace falta perforar entrega una plantilla imprimible en 3D.
2. **Calcular los costos de verdad.** Con el espacio propio escaneado o dibujado: cuánto cuesta la cocina, cuánto el piso, cuántos tableros y cuántas cajas de cerámica, cuánta pega y cuánto boquilla, con precios de tiendas cercanas y fecha visible. Lo que no tiene precio queda marcado, nunca inventado.
3. **Decidir con criterio.** Cajón o tapa con pistón y bisagra, melamina de 15 o de 18, cerámica o porcelanato, piso en recto o en diagonal: Handy compara costo, dificultad de armado y resultado, y explica por qué.
4. **Cortar con eficiencia.** Despiece de tableros y de piezas de piso que minimiza desperdicio y se puede llevar a la tienda tal cual.
5. **Tu propia IA.** Handy se conecta por MCP a la IA que el usuario ya paga (Claude, ChatGPT, modelos locales). Handy no cobra por IA ni la intermedia: pone el motor, las reglas y los precios; la IA conversa, propone y explica.

## Idea central

Prototipos rápidos y fieles. Fieles en medidas (milímetros reales, muros con su grosor, el escaneo de tu cuarto), fieles en materiales (el decorado, la cerámica y el herraje que vas a comprar, con su precio) y fieles en comportamiento (abre sin chocar, aguanta la carga, se arma en el orden correcto). Y rápidos: minutos, en el navegador, sin aprender un CAD. Cuando el prototipo convence, salen la lista de compras, el despiece para la tienda, las instrucciones de armado y, si se quiere, el modelo para Blender.

## Tres secciones

- **Espacios**: apartamentos, cuartos, casas. Mapa del lugar, grosor de muros, aberturas, puntos eléctricos y sanitarios, sol, **pisos y enchapes**.
- **Muebles**: madera, tablero, ladrillo y **perfiles de acero o aluminio**. Medidas, sistema de unión según habilidad, lista de corte, herrajes, cotización, esfuerzos, instrucciones de armado.
- **Objetos**: piezas pequeñas, repuestos, **plantillas de perforado** y accesorios para imprimir en 3D.

## Principios

1. **Milímetros, siempre.** El motor trabaja en mm enteros; la UI muestra cm, m o pulgadas.
2. **Local-first y archivos abiertos.** Un proyecto es un `.handy.json` que puedes versionar en git. Exporta a STL, 3MF, glTF, DXF, CSV y PDF.
3. **Región-agnóstico.** Precios, formatos de tablero y cerámica, normativas eléctricas y sanitarias se cargan desde datos por país; la comunidad los mantiene.
4. **Reglas explicables.** Cada aviso o sugerencia cita la regla ("luz > 800 mm en 18 mm pandea", "porcelanato de 60 x 60 lleva pega flexible, 5 kg/m² con llana de 10") o el criterio que la motiva.
5. **Una sola fuente de verdad.** Web, ejecutable, CLI y MCP usan el mismo `@handy/core`.
6. **Cotización honesta.** Cada precio muestra tienda, fecha y si es estimado. Handy nunca inventa un precio. Si una tienda paga comisión a Handy, se declara, y el orden de las ofertas nunca depende de ella (ADR-0004).
7. **Para el que lo hace él mismo.** Si una opción exige herramienta o precisión que el usuario no tiene, Handy lo dice y ofrece la alternativa: otro herraje, perforación en la tienda o plantilla impresa.

## Lo que Handy no es

- No es un CAD general ni un reemplazo de Blender. Modela espacios, muebles de tablero o ladrillo y piezas paramétricas, y exporta a los programas profesionales para lo demás.
- No reemplaza al profesional en instalaciones eléctricas, sanitarias ni en estructura: entrega medidas de referencia, inferencias con nivel de confianza y cálculos preliminares, no certifica.
- No es un marketplace. Muestra precios y puede referirte a tiendas o talleres con comisión declarada, pero no vende ni almacena materiales.
- No es un servicio de IA. La IA es la del usuario.
