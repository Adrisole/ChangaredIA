# Auditoría funcional de Changared — 8 de octubre de 2026

Alcance: código de la rama `codex/audit-honest-integrations`, derivada de la corrección de persistencia del PR 6; interfaz principal, rutas, servicios y seis pruebas de regresión. No se verificaron credenciales ni una venta real en producción. Este documento distingue existencia de código de funcionamiento desplegado.

## Bloqueantes

| Prioridad | Hallazgo y evidencia | Acción necesaria |
|---|---|---|
| P0 | `accounting.routes.js` expone lectura, creación, modificación y borrado de facturas por businessId sin autenticación ni propietario. `appointment.routes.js` también expone turnos y cambios de estado sin autorización. | Proteger cada operación, adaptar clientes para enviar sesión y comprobar aislamiento entre dos cuentas. El ingreso de correos externo necesita credencial/firma propia. |
| P0 | `billing.controller.js` activa suscripciones por el tipo declarado de un webhook, sin validar firma ni consultar el pago al proveedor; tampoco espera la promesa de activación. | No usar para acreditar pagos. Validar procedencia, consultar estado e identidad del pago, idempotencia y errores. |
| P1 | La migración anterior sobrescribía registros con JSON local al arrancar. PR 6 cambia a inserción exclusiva de faltantes y bloquea API mientras Mongo esté desconectado. | Desplegar y comprobar nombre, un producto, recarga y reinicio. No hay recuperación demostrada de datos anteriores. |
| P1 | `deleteProductRow` envía todo el catálogo. `setupBusiness` lee y luego guarda el negocio completo. Una venta concurrente puede perder stock o pedidos actualizados. | Actualizaciones por campo y eliminación por ID con operaciones atómicas; probar venta concurrente con edición. PR 6 protege solamente altas/importaciones y arranque. |

## Promesas y acciones de la interfaz

| Área | Estado comprobado | Resultado |
|---|---|---|
| Enlace `/chat/:negocio` | Sin ruta; cae en redirección general 301. | No abre el vendedor. Retirado del modal en esta rama. |
| Script `cdn.changared.com/widget.js` | No existe implementación de widget en este repositorio. No se verificó infraestructura CDN externa. | No ofrecer como instalación lista. Retirado. |
| Confirmación de dominio | Solo localStorage, sin prueba de propiedad ni control en servidor. | No protege una web. Retirado falso éxito. |
| Vista flotante | Consulta al asesor comercial fijo `/api/chat/changared`, con respuestas locales si falla. | No demuestra el vendedor del negocio elegido. Retirado como prueba de widget instalado. |
| WhatsApp Web | `wa.me` abre un chat para que una persona escriba. | No vincula una sesión ni permite a la IA leer y responder mensajes. |
| Botón de vinculación antiguo | Cambia booleano local y anuncia éxito. | Sustituido por orientación a configuración oficial, sin declarar conexión. |
| Configuración Meta | Hay envío HTTP a Graph API y webhook. Guardar credenciales no prueba entrega ni recepción. | Falta prueba real de ida y vuelta y estado derivado del servidor. |
| Catálogo | Altas e importación ahora esperan servidor. Eliminación mantiene riesgo concurrente. Tabla principalmente de lectura. | Falta edición explícita de precio/stock por producto y comprobación desplegada. |
| Vendedor de prueba | Ruta privada usa IA con catálogo; no ejecuta pedidos. | Útil para probar respuestas; no equivale a compra real. |
| Pedidos y alias | Registra pedido, dueño confirma pago manualmente, descuenta stock y pide notificación vía API. | No verifica transferencias ni Mercado Pago automáticamente. Falta ensayo real. |
| Suscripción | `triggerCheckout` mostraba alertas simuladas de débito. | Sustituido por aviso de contratación no habilitada. |
| Google Calendar | No hay servicio de integración OAuth/Calendar; varios flujos son simulaciones locales con mensajes de sincronización. | No anunciar agenda conectada hasta implementar y verificar. |
| Gmail/Drive/Sheets | `googleSheets.service.js` guarda facturas en JSON; nombre del servicio no implica conexión a Google. | Persistencia durable, OAuth e integración real pendientes; no afirmar envío al contador. |
| Pie de página | Enlaces externos a proveedores presentados como integraciones y teléfono de ejemplo como soporte. | Sustituido por navegación interna del vendedor; retirado “Marca Registrada” sin respaldo. |
| Planes | Full Empresa dice ilimitado pero configura cuota 10.000. | Unificar oferta con límites efectivamente aplicados. |
| Radar y turnos demo | Hay contadores y acciones simulados. | Rotular demostración en cada flujo o retirar acciones antes de venta comercial. |

## Instalación para personas que no programan

Primera entrega recomendada: una página pública del vendedor con enlace propio, sin acceso al panel privado. El dueño copia el enlace a Instagram o a un botón en su web. Debe existir publicación explícita, límite de uso, identidad del negocio, catálogo actualizado y manejo visible de errores. No habilitar un endpoint público de IA sin límites.

Segunda entrega: widget real servido desde un origen existente, con instrucciones específicas por plataforma verificadas. Si el usuario no tiene acceso al editor, necesita al administrador de su web. No prometer instalación universal en dos minutos ni protección de dominio mediante un campo local.

## WhatsApp sin API

El proyecto no implementa automatización de WhatsApp Web. Una integración mediante QR y cliente no oficial sería otro desarrollo, con dependencia de sesiones, reconexiones, servidor y compatibilidad cambiante; no es una opción disponible hoy. Las directrices de WhatsApp restringen clientes y automatización no autorizados: https://www.whatsapp.com/legal/messaging-guidelines . La opción oficial para respuestas automáticas es WhatsApp Business Platform. Abrir WhatsApp Web sirve para atención manual.

## Orden de resolución

1. Aislar facturas/turnos y detener acreditaciones por webhook no verificado.
2. Desplegar protección Mongo, validar empresa y producto persistentes, corregir escrituras concurrentes.
3. Probar vendedor privado con catálogo real.
4. Configurar Meta y comprobar mensaje recibido, respuesta entregada, pedido, alias, confirmación manual, descuento y notificaciones.
5. Implementar publicación web sin programación y luego widget.
6. Completar o retirar promesas de Calendar, Google, suscripciones y radar.

## Verificación realizada

Pasaron seis pruebas locales de regresión: catálogo, persistencia, stock en altas, migración, sesiones y pedidos. Usan dobles de prueba; no acreditan integración real con Atlas, Meta ni proveedores de pago. Los cambios de esta rama corrigen presentación y falsas acciones; los bloqueantes enumerados siguen pendientes.
