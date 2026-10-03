import { config } from '../config/env.js';

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
  async generateReply(business, customerMessage, customerId = 'Cliente') {
    const startTime = Date.now();

    // 1. Si no hay API key configurada, activamos simulación inteligente para pruebas
    if (!config.openai.apiKey) {
      console.warn(`[AgentBrain] OPENAI_API_KEY no detectada. Generando respuesta simulada para [${business.name}].`);
      const mockReply = this._generateSimulatedReply(business, customerMessage);
      return {
        reply: mockReply,
        businessId: business.id,
        businessName: business.name,
        executionTimeMs: Date.now() - startTime,
        model: 'SIMULATED_AGENT',
      };
    }

    try {
      // 2. Construcción del Prompt Dinámico Multi-Tenant
      const systemPrompt = this._buildDynamicSystemPrompt(business);
      
      // 3. Llamada a la API de OpenAI
      const reply = await this._callOpenAI(systemPrompt, customerMessage);

      return {
        reply,
        businessId: business.id,
        businessName: business.name,
        executionTimeMs: Date.now() - startTime,
        model: config.openai.model,
      };
    } catch (error) {
      console.error(`[AgentBrain Error] Fallo al consultar OpenAI para ${business.id}:`, error.message);
      // Fallback seguro para no dejar al cliente sin respuesta en WhatsApp
      const fallbackReply = this._generateSimulatedReply(business, customerMessage);
      return {
        reply: fallbackReply,
        businessId: business.id,
        businessName: business.name,
        executionTimeMs: Date.now() - startTime,
        model: 'FALLBACK_SIMULATED',
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
  async _callOpenAI(systemPrompt, userMessage) {
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
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3, // Temperatura baja para respuestas coherentes con stock y precios
        max_tokens: 350,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || 'Disculpa, ¿podrías repetir tu consulta?';
  }

  /**
   * Motor de simulación inteligente para pruebas sin API Key
   */
  _generateSimulatedReply(business, userMessage) {
    const msg = userMessage.toLowerCase();
    const catalog = Array.isArray(business.catalog) ? business.catalog : [];

    // 1. Detección de Turnos / Citas / Reservas (Google Calendar)
    const isAppointmentQuery = /\b(turno|citas?|agendar?|reservar?|reservas?|consulta|horario disponible|sacar turno|hora)\b/i.test(msg);
    if (isAppointmentQuery) {
      return `¡Hola! 📅 Con gusto te agendamos en ${business.name}. Tenemos disponibilidad en tiempo real sincronizada con Google Calendar. ¿Para qué día y en qué horario preferís tu cita? (Se confirma automáticamente con una seña mediante Mercado Pago).`;
    }

    // 2. Detección de Cobranzas / Deuda / Enlace de pago (Mercado Pago)
    const isDebtQuery = /\b(deuda|cobranza|saldo|pagar|pago|transferencia|alias|link de pago|mora|cuota)\b/i.test(msg);
    if (isDebtQuery) {
      return `¡Hola! Te contactamos desde el área de administración de ${business.name}. Podés regularizar tu saldo de forma inmediata mediante Mercado Pago o transferencia bancaria directa. ¿Te gustaría que te enviemos el link de pago oficial en este momento?`;
    }

    // 3. Detección de Facturación / Contabilidad / OCR (Google Drive & Sheets)
    const isAccountingQuery = /\b(factura|cuit|afip|comprobante|gasto|impuesto|iva|recibo)\b/i.test(msg);
    if (isAccountingQuery) {
      return `¡Hola! Recibimos tu comprobante para ${business.name}. El Asistente Contable lo procesa mediante OCR inteligente, extrae CUIT, CAE y desglose de IVA, y lo archiva automáticamente en Google Drive y Google Sheets.`;
    }

    // 4. Detección de Moda / Medidas / Talles (TalleExacto)
    const isSizeQuery = /\b(talle|medida|busto|cintura|cadera|size|vestido|prenda|pantalon|tamanho)\b/i.test(msg);
    if (isSizeQuery) {
      return `¡Hola! ✨ Analizamos tus medidas con el motor inteligente TalleExacto en ${business.name}: tu talle sugerido es M (Calce Ideal). Ofrece el ajuste perfecto y máxima comodidad. ¿Te gustaría reservarlo antes de que se agote el stock?`;
    }

    // 5. Detección de Inglés
    const isEnglish = /\b(hello|hi|price|how much|available|beer|order|delivery|what|menu|appointment|booking|reserve)\b/i.test(msg);
    if (isEnglish) {
      if (isAppointmentQuery || msg.includes('appointment') || msg.includes('book') || msg.includes('reserve')) {
        return `Hello! 📅 We would be glad to schedule your appointment at ${business.name}. We sync directly with Google Calendar. Which date and time work best for you?`;
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
        return `Olá! 📅 Será um prazer agendar seu horário na ${business.name}. Nosso calendário está sincronizado com o Google Calendar. Para qual dia e horário você prefere?`;
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
      return `¡Hola! Mil disculpas, pero en este momento ${outOfStock.name} se encuentra agotado o sin disponibilidad de turno. ¿Te gustaría consultar alguna de nuestras otras opciones disponibles en ${business.name}?`;
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
    return `¡Hola! Te estás comunicando con el asistente de ${business.name}. ¿En qué podemos ayudarte hoy?`;
  }
}

export const agentBrainService = new AgentBrainService();
