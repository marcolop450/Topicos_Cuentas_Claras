# Bitácora de Prompts

## 2026-08-26 11:41:51
**Modelo**: Gemini 3.1 Pro (High)
**Mensaje**:
Eres un Señor en la Programacion se realizara un Proyecto App Web, Existen estas Limitaciones 1. Van directo al asistente de IA. Prohibido escribir documentos de diseño o especificación previos. 2. Iteren con prompts libremente: "agrega esto", "arregla aquello", "hazlo más bonito". 3. No lean el código en detalle: si algo falla, descríbanselo a la IA y que ella lo resuelva. 4. Meta: tener la app funcionando lo antes posible., Lo unico que se va a guardar es un .MD de todos los Promts que te mandare (Mensajes) se llamara Bitacora.md y guarda hora y fecha del mensaje, mas el mensaje con el tipo de Modelo usado, tu me indicas el Back y Front y me mandaras un Script para SUPABASE y me indicas como colocar la direccion (env) y aqui viene el tema del Proyecto: Consigna: App "Cuentas Claras" El pedido del cliente Construyan una app web para dividir gastos entre amigos de un viaje. Se deben poder agregar participantes, registrar gastos indicando quién pagó, y la app debe mostrar cuánto debe cada quien y cómo saldar las deudas. Eso es todo lo que el cliente dijo. Como en la vida real, ustedes deberán descubrir qué significa exactamente. Escenario de ejemplo Cuatro amigos —Ana, Beto, Carla y Diego— se van de fin de semana a Samaipata. Ana paga la cabaña (Bs. 800) y las entradas a El Fuerte (Bs. 160), Beto paga la cena (Bs. 400), Carla la gasolina (Bs. 240) y Diego no paga nada. Al final del viaje, la app debe decirles cómo quedar a mano: por ejemplo, "Diego → Ana: Bs. 400" y "Carla → Ana: Bs. 160".  ,,, Funcionalidad mínima esperada (ambos grupos) ✅ Agregar y listar participantes. ✅ Registrar un gasto: descripción, monto, quién pagó, entre quiénes se divide (por defecto todos, pero debe poderse excluir gente de un gasto). ✅ Editar y eliminar gastos. ✅ Pantalla de saldos: balance de cada participante (positivo = le deben, negativo = debe). ✅ Pantalla de liquidación: lista de transferencias "X → Y: monto" para quedar a mano. ✅ Los datos sobreviven al refrescar la página. Pista matemática: la suma de todos los balances debe dar siempre exactamente 0. Si en algún momento no da 0, tienen un bug (probablemente de redondeo). Piensen qué hacen con los centavos cuando Bs. 100 se divide entre 3.Entregables 1. Repositorio Git con la app funcionando. 2. Demo de 3 minutos: cargar el escenario de Samaipata y mostrar la liquidación. Reglas de juego limpio Usen la IA todo lo que quieran dentro de las reglas de su grupo. No copien código de otro equipo (la IA genera soluciones distintas; se nota). En la demo, cualquier integrante debe poder explicar cómo funciona el cálculo de liquidación de su propia app. "Lo hizo la IA" no es una explicación.   y a Trabajar

## 2026-08-26 11:54:02
**Modelo**: Gemini 3.1 Pro (High)
**Mensaje**: Listo, Los pasos y en Primera Ejecucion tenemos estos errores Uncaught SyntaxError: The requested module '/src/utils.ts' does not provide an export named 'Balance' (at App.tsx:3:86)


## 2026-08-26 12:01:21
**Modelo**: Gemini 3.1 Pro (High)
**Mensaje**: Primera Pruebas estoy Haciendo con el Escenario de Ejemplo Cuatro amigos... (usuario reporta supuesto fallo en c�lculo con im�genes adjuntas)


## 2026-08-26 12:08:57
**Modelo**: Gemini 3.1 Pro (High)
**Mensaje**: Buena dame comando para Limpiar la BD, y quiero que se aumente lo siguiente: Primero un Registro (Historial) para guardar las cuentas claras, que se pueda iniciar otras cuentas para poder A�adir una cuenta nueva con nuevas Personas, No usar Emojis, y tambien que el Titulo sea mas Global que no se refiera a solo de Viajes, y Frontend Responsivo si es que falta, Si hay que modificar la BD avisas nomas que es lo nuevo, borrar o limpiar}


## 2026-08-26 12:25:27
**Modelo**: Gemini 3.1 Pro (High)
**Mensaje**: Vale, 3 objetos para acomodar primero el Monto que suba de 10 en 10 en vez de Centavos, segundo No hay validaciones o ningun mensaje si falta colocar algun texto por ejemplo al crear una cuenta falta y quitar las Alert's que sean Modales nada mas y revisa si no existe errores internos (Realizar Loop)


## 2026-08-26 12:34:32
**Modelo**: Claude Opus 4.6 (Thinking)
**Mensaje**: Perfecto, Me gusta se ve que trabaja, mantenelo Funcional lo que quiero es un diseño Moderno, Un Titulo de presentacion dando un inicio con un resumen del Programa, Bonito luego para entrar al programa, Recordar Sin emojis y guardando la Bitacora los promts

## 2026-08-26 12:43:12
**Modelo**: Claude Opus 4.6 (Thinking)
**Mensaje**: Regla de Oro: Dividir en Varias Paginas (Direcciones de Archivo) no todo en localHost:XXXX sino LocalHost:XXXX/Landing,  /index, /NombredelaCuenta y falto el diseño alas otras Paginas, Metele animaciones igual

## 2026-08-26 12:52:45
**Modelo**: Claude Opus 4.6 (Thinking)
**Mensaje**:Te falto añadir el anterior Promt, que se pueda eliminar Participantes y no se puede eliminar si ya presenta una Deuda (Negativo numero), bajale las Animaciones y como indique a todas las pantallas cambiale el Diseño no Moderno mejor Minimalista con colores que hacen referencia a una APP de Pagos y que tenga Modo Ligth y Modo Oscuro y este es el Git donde se guarda el Proyecto: https://github.com/marcolop450/Topicos_Cuentas_Claras.git