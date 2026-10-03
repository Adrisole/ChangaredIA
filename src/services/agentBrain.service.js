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

    // Detección de Inglés (usando límites de palabra \b para precisión)
    const isEnglish = /\b(hello|hi|price|how much|available|beer|order|delivery|what|menu)\b/i.test(msg);
    if (isEnglish) {
      if (msg.includes('corona') || msg.includes('beer')) {
        return `Hello! Welcome to ${business.name}. We apologize, but Corona Beer is currently out of stock. However, our fresh artisan pizzas and soft drinks are available! Would you like to check our available menu?`;
      }
      return `Hello! Thank you for reaching out to ${business.name}. Our delivery starts at 19:30. Classic Muzzarella Pizza is available for $8,500. How can we assist your order today?`;
    }

    // Detección de Portugués (evitando que 'hola' coincida con 'ola')
    const isPortuguese = /\b(olá|obrigado|obrigada|quanto custa|boa noite|bom dia|cerveja|cardápio)\b/i.test(msg) || (/\bola\b/i.test(msg) && !/\bhola\b/i.test(msg));
    if (isPortuguese) {
      if (msg.includes('corona') || msg.includes('cerveja')) {
        return `Olá! Seja bem-vindo à ${business.name}. Pedimos desculpas, mas a Cerveja Corona está esgotada no momento. No entanto, temos pizzas artesanais frescas disponíveis! Gostaria de fazer seu pedido?`;
      }
      return `Olá! Obrigado por entrar em contato com a ${business.name}. Atendemos a partir das 19:30 com entregas rápidas. A Pizza de Muzzarella sai por $8.500. Como podemos te ajudar?`;
    }
    
    // Si pregunta por el catálogo o menú (Español)
    if (msg.includes('menu') || msg.includes('carta') || msg.includes('catalogo') || msg.includes('precio') || msg.includes('tienen')) {
      const available = business.catalog
        .filter(p => p.stock > 0)
        .slice(0, 3)
        .map(p => `• ${p.name}: $${p.price} (${p.stock} disponibles)`)
        .join('\n');
      
      return `¡Hola! Con gusto te paso lo que tenemos disponible en ${business.name}:\n\n${available}\n\n¿Te gustaría encargar alguno? 😊`;
    }

    // Si pregunta por un producto sin stock
    const outOfStock = business.catalog.find(p => p.stock === 0 && msg.includes(p.name.toLowerCase()));
    if (outOfStock) {
      return `¡Hola! Mil disculpas, pero en este momento ${outOfStock.name} se encuentra agotado. ¿Te gustaría probar alguna de nuestras otras opciones disponibles?`;
    }

    // Si pregunta por horario o delivery
    if (msg.includes('horario') || msg.includes('abierto') || msg.includes('envio') || msg.includes('delivery')) {
      return `¡Hola! Te cuento sobre nuestro servicio en ${business.name}: ${business.description}. ¡Cualquier duda acá estamos!`;
    }

    // Saludo genérico
    return `¡Hola! Te estás comunicando con el asistente de ${business.name}. ¿En qué podemos ayudarte hoy?`;
  }
}

export const agentBrainService = new AgentBrainService();
