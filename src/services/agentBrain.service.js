import { config } from '../config/env.js';
import { sellerOrdersService } from './sellerOrders.service.js';

/**
 * Cerebro del Empleado Virtual con IA para WhatsApp.
 * Inyecta dinámicamente el catálogo, reglas y tono de voz de cada tenant en el modelo.
 */
export class AgentBrainService {
  /**
   * Genera la respuesta del empleado virtual para un negocio y mensaje específico.
   * @param {Object} business - Objeto completo del negocio (tenant)
   * @param {string} customerMessage - Mensaje enviado por el cliente en WhatsApp
   * @param {string} customerId - Número de teléfono o identificador del cliente
   * @returns {Promise<Object>} Respuesta generada y metadatos
   */
  async generateReply(business, customerMessage, customerId = 'Cliente', options = {}) {
    const startTime = Date.now();

    // Sin proveedor de IA no se simula una venta: sólo se responde con datos
    // verificables del catálogo o se deriva a una persona.
    if (!config.openai.apiKey) {
      console.warn(`[AgentBrain] OPENAI_API_KEY no detectada. Usando respuesta segura para [${business.name}].`);
      const mockReply = this._generateVerifiedFallback(business, customerMessage);
      return {
        reply: mockReply,
        businessId: business.id,
        businessName: business.name,
        executionTimeMs: Date.now() - startTime,
        model: 'SAFE_FALLBACK',
      };
    }

    try {
      // 2. Construcción del Prompt Dinámico Multi-Tenant
      const systemPrompt = this._buildDynamicSystemPrompt(business);
      
      // 3. Llamada a la API de OpenAI
      const reply = await this._callOpenAI(systemPrompt, customerMessage, business, customerId, options);

      return {
        reply,
        businessId: business.id,
        businessName: business.name,
        executionTimeMs: Date.now() - startTime,
        model: config.openai.model,
      };
    } catch (error) {
      console.error(`[AgentBrain Error] Fallo al consultar OpenAI para ${business.id}:`, error.message);
      // Fallback seguro: nunca inventa pagos, disponibilidad, talles ni turnos.
      const fallbackReply = this._generateVerifiedFallback(business, customerMessage);
      return {
        reply: fallbackReply,
        businessId: business.id,
        businessName: business.name,
        executionTimeMs: Date.now() - startTime,
        model: 'SAFE_FALLBACK',
        error: error.message,
      };
    }
  }

  /**
   * Construye el System Prompt inyectando el contexto exclusivo del negocio.
   */
  _buildDynamicSystemPrompt(business) {
    // Formatear catálogo con control estricto de stock
    const catalogFormatted = business.catalog && business.catalog.length > 0
      ? business.catalog
          .map((prod) => {
            const stockStatus = prod.stock > 0
              ? `${prod.stock} unidades disponibles`
              : 'AGOTADO / SIN STOCK';
            return `- [${prod.id}] ${prod.name} | Precio: $${prod.price} | Stock: ${stockStatus} | Descripción: ${prod.description || 'N/A'}`;
          })
          .join('\n')
      : 'Catálogo vacío temporalmente.';

    // Formatear reglas del negocio
    const rulesFormatted = business.businessRules && business.businessRules.length > 0
      ? business.businessRules.map((rule) => `• ${rule}`).join('\n')
      : '• Atender con amabilidad y brindar información veraz.';

    const languageDirectives = `
POLÍTICA DE IDIOMA Y MULTILINGÜISMO:
- Idioma principal de la tienda: ${business.language || 'Español'}.
- Detección automática: ${business.autoDetectLanguage !== false ? 'ACTIVADA' : 'DESACTIVADA'}.
- Si el cliente te escribe en otro idioma (ej: Inglés, Portugués, Francés, etc.) y la detección automática está activada, DETECTA su idioma y responde de forma natural y fluida en ese mismo idioma. Mantén los nombres propios de los productos, precios y reglas operativas intactas.
`;

    return `
Eres el empleado virtual oficial de atención al cliente por WhatsApp del negocio: "${business.name}".

==============================
CONTEXTO DEL NEGOCIO:
${business.description}

TONO DE VOZ OBLIGATORIO:
${business.toneOfVoice}

${languageDirectives}

REGLAS DE NEGOCIO ESTRICTAS (DEBES CUMPLIRLAS SIEMPRE):
${rulesFormatted}

CATÁLOGO Y STOCK DISPONIBLE EN TIEMPO REAL:
${catalogFormatted}

MEDIO DE PAGO DEL NEGOCIO:
${business.paymentMethod || 'Sin configurar. Pedí al cliente que consulte al dueño; no inventes un alias.'}
Un alias sirve para transferir: no es un enlace de pago ni verifica una transferencia.
No confirmes pagos, descuentos de stock, avisos enviados ni números de pedido sin una acción real.
Para tomar un pedido pedí productos y cantidades explícitos, el nombre del cliente y si retira o necesita entrega. Si necesita entrega, pedí dirección y costo de envío si el negocio lo informó. Si están claros y el cliente quiere comprar, utilizá registrar_pedido cuando esté disponible. El pedido queda pendiente hasta que el dueño verifique el pago; el stock no queda reservado antes de ese momento. Si falta información, pedila y no registres un pedido incompleto.
==============================

DIRECTIVAS CLAVE PARA RESPONDER EN WHATSAPP:
1. Responde de forma concisa, humana y natural, adecuada para un chat de WhatsApp (evita párrafos excesivamente largos).
2. NUNCA ofrezcas ni confirmes ventas de productos que figuren como "AGOTADO / SIN STOCK" o que no existan en el catálogo.
3. Si el cliente pregunta por un producto sin stock, indícaselo con amabilidad y ofrécele una alternativa disponible si existe.
4. Si a un producto le quedan 3 o menos unidades de stock, avísale sutilmente ("¡Nos quedan solo X unidades!").
5. Menciona los precios tal como están estipulados en el catálogo. No inventes descuentos salvo que estén en las reglas.
6. Si el cliente quiere confirmar un pedido o pagar, guíalo según las reglas de negocio (ej. formas de pago, alias, horarios).
`.trim();
  }

  /**
   * Ejecuta la consulta a OpenAI mediante fetch nativo
   */
  async _callOpenAI(systemPrompt, userMessage, business, customerId, options = {}) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...(Array.isArray(options.history) ? options.history.filter(m => typeof m.text === 'string').map(m => ({ role: m.sender === 'customer' ? 'user' : 'assistant', content: m.text })) : []),
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3, // Temperatura baja para respuestas coherentes con stock y precios
        max_tokens: 350,
        ...(options.takeOrders ? { tools: [{ type: 'function', function: { name: 'registrar_pedido', description: 'Registrar un pedido completo. No confirma el pago ni reserva stock.', parameters: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { productId: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } }, required: ['productId', 'quantity'], additionalProperties: false } }, customerName: { type: 'string' }, fulfillmentMethod: { type: 'string', enum: ['pickup', 'delivery'] }, deliveryAddress: { type: 'string' }, deliveryCost: { type: 'number', minimum: 0 }, customerNote: { type: 'string' } }, required: ['items', 'customerName', 'fulfillmentMethod'], additionalProperties: false } } }] } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const calls = data.choices?.[0]?.message?.tool_calls;
    if (options.takeOrders && calls?.length) {
      const call = calls.find(c => c.function?.name === 'registrar_pedido');
      if (call) {
        try {
          const args = JSON.parse(call.function.arguments);
          const order = await sellerOrdersService.create(business.id, customerId, args.items, options.sourceId, args);
          const delivery = order.fulfillmentMethod === 'delivery' ? ` Envío a: ${order.deliveryAddress}.` : ' Retiro en el negocio.';
          return `Pedido #${order.id} registrado: ${order.items.map(i => `${i.quantity} × ${i.name}`).join(', ')}. Total: $${order.total}.${delivery} ${business.paymentMethod ? `Podés pagar usando: ${business.paymentMethod}.` : 'Consultá al dueño por el medio de pago.'} Queda pendiente de verificar el pago; el stock se confirma cuando se acredite.`;
        } catch (error) {
          return `No pude registrar el pedido: ${error.message}`;
        }
      }
    }
    return data.choices?.[0]?.message?.content?.trim() || 'Disculpa, ¿podrías repetir tu consulta?';
  }

  /**
   * Motor de simulación inteligente para pruebas sin API Key
   */
  _generateVerifiedFallback(business, userMessage) {
    const msg = userMessage.toLowerCase();
    const catalog = Array.isArray(business.catalog) ? business.catalog : [];

    // 1. Detección de turnos. Sin OAuth de Calendar no se promete disponibilidad externa.
    const isAppointmentQuery = /\b(turno|citas?|agendar?|reservar?|reservas?|consulta|horario disponible|sacar turno|hora)\b/i.test(msg);
    if (isAppointmentQuery) {
      return `¡Hola! 📅 Podemos tomar tu solicitud de turno en ${business.name}. ¿Qué servicio, día y rango horario preferís? El negocio confirma la disponibilidad antes de considerar la cita agendada.`;
    }

    // 2. Detección de Cobranzas / Deuda / Enlace de pago (Mercado Pago)
    const isDebtQuery = /\b(deuda|cobranza|saldo|pagar|pago|transferencia|alias|link de pago|mora|cuota)\b/i.test(msg);
    if (isDebtQuery) {
      if (business.paymentMethod) {
        return `¡Hola! Te contactamos desde administración de ${business.name}. El medio de pago informado es: ${business.paymentMethod}. La acreditación debe ser verificada por el negocio.`;
      }
      return `¡Hola! Para no darte un dato equivocado, el equipo de ${business.name} te confirma el medio de pago y el saldo.`;
    }

    // 3. Consultas sobre organización de comprobantes para el contador
    const isAccountingQuery = /\b(factura|cuit|afip|comprobante|gasto|impuesto|iva|recibo)\b/i.test(msg);
    if (isAccountingQuery) {
      return `¡Hola! Recibimos tu comprobante para ${business.name}. Podés cargar sus datos en la bandeja de revisión, verificar CUIT y montos, y luego exportar el resumen para tu contador.`;
    }

    // 4. Detección de Moda / Medidas / Talles (TalleExacto)
    const isSizeQuery = /\b(talle|medida|busto|cintura|cadera|size|vestido|prenda|pantalon|tamanho)\b/i.test(msg);
    if (isSizeQuery) {
      return `¡Hola! Para recomendarte un talle correcto necesitamos tus medidas y la tabla específica de la prenda. El equipo de ${business.name} te ayuda a confirmarlo antes de reservar.`;
    }

    // 5. Detección de Inglés
    const isEnglish = /\b(hello|hi|price|how much|available|beer|order|delivery|what|menu|appointment|booking|reserve)\b/i.test(msg);
    if (isEnglish) {
      if (isAppointmentQuery || msg.includes('appointment') || msg.includes('book') || msg.includes('reserve')) {
        return `Hello! 📅 We can take your appointment request at ${business.name}. Which service, date, and time range work best for you? The business confirms availability before the appointment is booked.`;
      }
      const outOfStockEng = catalog.find(p => p.stock === 0 && msg.includes(p.name.toLowerCase()));
      if (outOfStockEng) {
        return `Hello! Welcome to ${business.name}. We apologize, but ${outOfStockEng.name} is currently out of stock. Would you like to explore our other available options?`;
      }
      if (catalog.length > 0) {
        const topAvail = catalog.filter(p => p.stock > 0).slice(0, 3).map(p => `• ${p.name}: $${p.price}`).join('\n');
        return `Hello! Welcome to ${business.name}. Here are our available options:\n\n${topAvail}\n\nDelivery and service hours: ${business.description}. How can we assist your order today?`;
      }
      return `Hello! Thank you for contacting ${business.name}. ${business.description}. How can we assist you today?`;
    }

    // 6. Detección de Portugués
    const isPortuguese = /\b(olá|obrigado|obrigada|quanto custa|boa noite|bom dia|cerveja|cardápio|agendar|reserva)\b/i.test(msg) || (/\bola\b/i.test(msg) && !/\bhola\b/i.test(msg));
    if (isPortuguese) {
      if (isAppointmentQuery || msg.includes('agendar') || msg.includes('reserva')) {
        return `Olá! 📅 Podemos registrar seu pedido de horário na ${business.name}. Qual serviço, dia e faixa de horário você prefere? O negócio confirma a disponibilidade antes de agendar.`;
      }
      const outOfStockPt = catalog.find(p => p.stock === 0 && msg.includes(p.name.toLowerCase()));
      if (outOfStockPt) {
        return `Olá! Seja bem-vindo à ${business.name}. Pedimos desculpas, mas ${outOfStockPt.name} está esgotado no momento. Gostaria de conhecer nossas outras opções?`;
      }
      if (catalog.length > 0) {
        const topAvailPt = catalog.filter(p => p.stock > 0).slice(0, 3).map(p => `• ${p.name}: $${p.price}`).join('\n');
        return `Olá! Seja bem-vindo à ${business.name}. Aqui estão nossos itens disponíveis:\n\n${topAvailPt}\n\nComo podemos te ajudar hoje?`;
      }
      return `Olá! Obrigado por entrar em contato com a ${business.name}. ${business.description}. Como podemos te ajudar?`;
    }
    
    // 7. Producto sin stock en Español (evaluado con prioridad)
    const outOfStock = catalog.find(p => {
      if (p.stock !== 0) return false;
      const prodName = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const queryNorm = msg.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return queryNorm.includes(prodName) || prodName.split(' ').some(w => w.length > 4 && queryNorm.includes(w));
    });
    if (outOfStock) {
      return `¡Hola! Mil disculpas, pero ${outOfStock.name} se encuentra agotado. ¿Te gustaría consultar otras opciones disponibles en ${business.name}?`;
    }

    // 8. Catálogo / Precios / Menú en Español
    if (msg.includes('menu') || msg.includes('carta') || msg.includes('catalogo') || msg.includes('precio') || msg.includes('tienen') || msg.includes('cuanto')) {
      if (catalog.length > 0) {
        const available = catalog
          .filter(p => p.stock > 0)
          .slice(0, 4)
          .map(p => `• ${p.name}: $${p.price} (${p.stock} disponibles)`)
          .join('\n');
        
        return `¡Hola! Con gusto te paso lo que tenemos disponible en ${business.name}:\n\n${available}\n\n¿Te gustaría encargar alguno o hacer tu reserva? 😊`;
      }
    }

    // 9. Horarios, envíos o ubicación
    if (msg.includes('horario') || msg.includes('abierto') || msg.includes('envio') || msg.includes('delivery') || msg.includes('donde') || msg.includes('direccion')) {
      return `¡Hola! Te cuento sobre nuestro servicio en ${business.name}: ${business.description}. ¡Cualquier duda acá estamos!`;
    }

    // 10. Saludo genérico institucional
    return `¡Hola! Gracias por escribir a ${business.name}. Para no darte información incorrecta, un integrante del equipo continúa tu consulta.`;
  }

  /**
   * Genera la respuesta del Asesor Comercial IA de Changared.
   * Asesora y vende los empleados virtuales de la plataforma, planes y prueba gratis de 14 días.
   * @param {string} userMessage - Consulta del visitante o comerciante
   * @param {Array} history - Historial opcional de mensajes previos [{role, content}]
   * @returns {Promise<Object>}
   */
  async generateChangaredSalesReply(userMessage, history = []) {
    const startTime = Date.now();
    const systemPrompt = `
Eres el Asesor Comercial Oficial de "Changared" (plataforma SaaS de Empleados Virtuales con IA para comercios, profesionales y pymes).

TU MISIÓN:
Asesorar con calidez, profesionalismo y visión comercial a dueños de negocios, comerciantes y profesionales. Tu objetivo es entender qué tipo de comercio o servicio tienen, recomendarles el empleado virtual ideal para automatizar su negocio y guiarlos para que comiencen su prueba gratuita de 14 días (sin tarjeta requerida).

CATÁLOGO DE EMPLEADOS VIRTUALES DE CHANGARED:
1. Vendedor IA (WhatsApp 24/7): Atiende clientes día y noche por WhatsApp, consulta el catálogo y stock en tiempo real, responde preguntas frecuentes, toma pedidos o coordina pagos automáticos por alias/Mercado Pago, e incluye atención multilingüe nativa (español, inglés y portugués) para atender turistas sin costo extra.
2. Gestor de Cobranzas Automático: Detecta facturas impagas o vencidas, envía recordatorios amistosos por WhatsApp con link de pago directo y concilia cobros.
3. Asesor Contable: organiza comprobantes de compras, alerta datos repetidos y permite exportar un resumen en Excel o CSV para que lo revise el contador.
4. Agendador de Citas: toma solicitudes de turno con servicio, fecha y horario. La sincronización con Google Calendar y los recordatorios se habilitan sólo después de completar su integración.
5. TalleExacto (Módulo Ropa & Calzado): Asesora sobre medidas y talles en tiendas de moda reduciendo devoluciones hasta un 85%.

REGLAS COMERCIALES Y DE VENTA:
- Se contrata por empleado: el cliente no paga por cosas que no usa, elige solo el o los empleados que necesita.
- Prueba gratuita: Todos los empleados incluyen 14 días de prueba gratis sin tarjeta de crédito.
- Integraciones: WhatsApp y Google Calendar requieren configurar sus credenciales oficiales antes de atender clientes reales.
- Tono: Consultivo, resolutivo, claro y enfocado en el crecimiento y ahorro de tiempo del comerciante.
- Respuestas concisas, dinámicas y profesionales. Invita al usuario a activar su prueba gratis desde el panel.
`.trim();

    if (config.openai.apiKey) {
      try {
        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.slice(-6).map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: String(h.content || '') })),
          { role: 'user', content: userMessage }
        ];

        const url = 'https://api.openai.com/v1/chat/completions';
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.openai.apiKey}`,
          },
          body: JSON.stringify({
            model: config.openai.model,
            messages,
            temperature: 0.4,
            max_tokens: 380,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content?.trim();
          if (reply) {
            return {
              reply,
              executionTimeMs: Date.now() - startTime,
              model: config.openai.model,
              configured: true
            };
          }
        }
      } catch (err) {
        console.warn('[ChangaredSales] OpenAI API fallback:', err.message);
      }
    }

    // Fallback comercial de alta conversión
    const mockReply = this._generateChangaredSalesMock(userMessage);
    return {
      reply: mockReply,
      executionTimeMs: Date.now() - startTime,
      model: 'CHANGARED_SALES_ENGINE',
      configured: Boolean(config.openai.apiKey)
    };
  }

  _generateChangaredSalesMock(userMessage) {
    const msg = (userMessage || '').toLowerCase();
    if (msg.includes('turno') || msg.includes('cita') || msg.includes('agenda') || msg.includes('calendar') || msg.includes('peluquer') || msg.includes('barber') || msg.includes('clínic') || msg.includes('clinic') || msg.includes('consultorio')) {
      return `Para servicios con citas como el tuyo, el Agendador toma solicitudes con servicio, fecha y horario para que no se pierdan consultas.\n\n• Ordena los datos del cliente y su preferencia.\n• Deja la cita pendiente hasta que el negocio la confirme.\n• La disponibilidad en Google Calendar, señas y recordatorios se habilitan al completar sus integraciones oficiales.\n\n¿Querés que te ayude a definir el flujo de confirmación para tu negocio?`;
    }
    if (msg.includes('whatsapp') || msg.includes('vender') || msg.includes('venta') || msg.includes('precio') || msg.includes('catalogo') || msg.includes('stock') || msg.includes('tienda') || msg.includes('local')) {
      return `¡El Vendedor IA para WhatsApp 24/7 es exactamente lo que necesitás!\n\n• Atiende y responde a tus clientes día y noche en segundos.\n• Lee tu catálogo y respeta el stock disponible en tiempo real (nunca vende lo agotado).\n• Pasa precios oficiales, medios de pago (Alias o Mercado Pago) y toma pedidos.\n• Se vincula a tu número escaneando un código QR oficial en 30 segundos.\n\nTenés 14 días gratis para probarlo con tus clientes reales. ¿Qué productos vendés principalmente?`;
    }
    if (msg.includes('cobranza') || msg.includes('deuda') || msg.includes('moros') || msg.includes('pagar') || msg.includes('vencid')) {
      return `Para evitar perseguir pagos, te recomendamos el Gestor de Cobranzas Automático:\n\n• Monitorea facturas vencidas o por vencer.\n• Envía recordatorios de pago amables pero firmes por WhatsApp con link directo de pago.\n• Reduce la mora hasta un 65% sin desgastar la relación con tus clientes.\n\n¿Tenés facturas mensuales recurrentes o cuentas corrientes comerciales?`;
    }
    if (msg.includes('factura') || msg.includes('contab') || msg.includes('gasto') || msg.includes('afip') || msg.includes('arca') || msg.includes('drive') || msg.includes('sheet') || msg.includes('excel')) {
      return `Para ordenar tu administración diaria, el Asesor Contable te ayuda a reunir comprobantes y entregarlos prolijos:\n\n• Importá una planilla o registrá un comprobante manualmente.\n• Revisá CUIT, proveedor, fecha, IVA, totales y posibles duplicados.\n• Exportá un Excel o CSV para que lo revise tu contador.\n\nNo reemplaza a un profesional ni presenta declaraciones ante ARCA.`;
    }
    if (msg.includes('precio') || msg.includes('cuanto') || msg.includes('costo') || msg.includes('plan') || msg.includes('gratis') || msg.includes('tarjeta')) {
      return `En Changared contratas por empleado, para que no pagues por funciones que no usas:\n\n• Tenés 14 días de prueba gratis sin tarjeta de crédito para probar el empleado que elijas con tu negocio real.\n• Podés vincular tu WhatsApp por QR o conectar tu Google Calendar en 30 segundos.\n• Luego de la prueba, los planes inician desde $19 USD/mes por empleado con soporte y actualizaciones continuas.\n\n¿Querés que activemos tu prueba gratis para tu comercio hoy mismo?`;
    }
    return `¡Hola! Soy el Asesor Comercial de Changared. Te ayudo a potenciar tu negocio con empleados virtuales:\n\n1. Vendedor IA WhatsApp 24/7 (atiende consultas, stock y pedidos).\n2. Agendador de Citas (turnos y disponibilidad).\n3. Gestor de Cobranzas (recordatorios de pago).\n4. Asesor Contable (comprobantes ordenados para tu contador).\n\n¿Qué tarea te gustaría automatizar primero?`;
  }
}

export const agentBrainService = new AgentBrainService();
