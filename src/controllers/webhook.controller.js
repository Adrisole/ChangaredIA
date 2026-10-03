import { businessService } from '../services/business.service.js';
import { agentBrainService } from '../services/agentBrain.service.js';
import { config } from '../config/env.js';

/**
 * Controlador de Webhooks de WhatsApp Multi-Tenant.
 * Gestiona verificación GET (Meta) y procesamiento de mensajes POST.
 */

/**
 * GET /api/webhook/:businessId
 * Verificación de Webhook para WhatsApp Cloud API (Meta challenge).
 */
export const verifyWebhook = (req, res) => {
  const { businessId } = req.params;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const business = businessService.getBusinessById(businessId);
  if (!business) {
    return res.status(404).send('Negocio no registrado en Changared');
  }

  // Verifica contra el token configurado
  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log(`[Webhook Verification] Webhook validado correctamente para tenant: ${businessId}`);
    return res.status(200).send(challenge);
  }

  return res.status(403).send('Token de verificación inválido');
};

/**
 * POST /api/webhook/:businessId
 * Recepción del mensaje del cliente y respuesta inteligente generada por el agente.
 */
export const handleIncomingMessage = async (req, res, next) => {
  try {
    const { businessId } = req.params;

    // 1. Validar que el negocio exista en la base multi-tenant
    const business = businessService.getBusinessById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'BUSINESS_NOT_FOUND',
        message: `No se encontró ningún negocio registrado con el ID '${businessId}'.`,
      });
    }

    // 2. Extraer remitente y texto del mensaje (Soporta formato directo y formato WhatsApp Cloud API de Meta)
    const { sender, messageText } = extractMessagePayload(req.body);

    if (!messageText) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_MESSAGE',
        message: 'No se detectó ningún texto en el cuerpo de la petición. Envía { "message": "tu texto" } o el formato oficial de WhatsApp.',
      });
    }

    console.log(`[WhatsApp Webhook] Mensaje recibido para [${business.name}] de [${sender}]: "${messageText}"`);

    // 3. Consultar al Cerebro del Agente con el contexto inyectado
    const aiResult = await agentBrainService.generateReply(business, messageText, sender);

    // 4. Retornar la respuesta generada
    return res.status(200).json({
      success: true,
      tenant: {
        businessId: business.id,
        businessName: business.name,
      },
      customer: {
        from: sender,
        messageReceived: messageText,
      },
      agentResponse: {
        text: aiResult.reply,
        model: aiResult.model,
        latencyMs: aiResult.executionTimeMs,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Normaliza y extrae el mensaje tanto de llamadas de prueba directas como de webhooks de Meta.
 */
function extractMessagePayload(body) {
  // Caso 1: Payload directo de prueba JSON: { "from": "+54911...", "message": "Hola" }
  if (body.message) {
    return {
      sender: body.from || body.sender || 'Cliente_Web',
      messageText: String(body.message).trim(),
    };
  }

  // Caso 2: Estructura oficial de Meta WhatsApp Cloud API
  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const messageObj = value?.messages?.[0];

  if (messageObj && messageObj.type === 'text') {
    return {
      sender: messageObj.from,
      messageText: messageObj.text?.body?.trim() || '',
    };
  }

  return { sender: 'Desconocido', messageText: '' };
}
