import { businessService } from '../services/business.service.js';
import { agentBrainService } from '../services/agentBrain.service.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { encryptionService } from '../services/encryption.service.js';
import { config } from '../config/env.js';

const maskPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `***${digits.slice(-4)}` : 'desconocido';
};

/**
 * Controlador de Webhooks de WhatsApp Multi-Tenant.
 * Gestiona verificación GET (Meta) y procesamiento de mensajes POST con Meta Cloud API oficial.
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

  if (businessId) {
    const business = businessService.getBusinessById(businessId);
    if (!business) {
      return res.status(404).send('Negocio no registrado en Changared');
    }
  }

  // Verifica contra el token configurado
  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log(`[Webhook Verification] Webhook validado correctamente con Meta challenge.`);
    return res.status(200).send(challenge);
  }

  return res.status(403).send('Token de verificación inválido');
};

/**
 * POST /api/webhook y /api/webhook/:businessId
 * Recepción del mensaje del cliente, deduplicación, resolución por phone_number_id,
 * actualización de estados de entrega y control humano/IA.
 */
export const handleIncomingMessage = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    let business = null;

    // 1. Identificar el comercio:
    // a) Primero verificar si Meta envía el Phone Number ID en el payload oficial
    const metaPhoneNumberId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    if (metaPhoneNumberId) {
      business = await businessService.getBusinessByPhoneNumberId(metaPhoneNumberId);
      if (business) {
        console.log(`[WhatsApp Webhook] Negocio identificado por Phone Number ID oficial de Meta (${metaPhoneNumberId}): [${business.name}]`);
      }
    }

    // b) Fallback o ruta con :businessId
    if (!business && businessId) {
      business = await businessService.getBusinessById(businessId);
    }

    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'BUSINESS_NOT_FOUND',
        message: metaPhoneNumberId
          ? `No se encontró ningún negocio registrado con el WhatsApp Phone Number ID '${metaPhoneNumberId}'.`
          : `No se encontró ningún negocio registrado para procesar el webhook.`,
      });
    }

    // 2. Validación criptográfica de firma oficial de Meta x-hub-signature-256 (HMAC-SHA256)
    const signature = req.headers['x-hub-signature-256'];
    const storedAppSecret = business.whatsappAppSecret;
    const activeAppSecret = storedAppSecret
      ? (encryptionService.isEncrypted(storedAppSecret) ? encryptionService.decrypt(storedAppSecret) : storedAppSecret)
      : config.whatsapp.appSecret;

    if (activeAppSecret) {
      if (!signature) {
        console.warn(`[WhatsApp Webhook] Rechazado por falta de firma x-hub-signature-256 para tenant: ${business.id}`);
        return res.status(401).json({
          success: false,
          error: 'MISSING_SIGNATURE',
          message: 'Se requiere firma criptográfica x-hub-signature-256 oficial de Meta.',
        });
      }
      const rawPayload = req.rawBody || JSON.stringify(req.body);
      const isValid = whatsappService.validateSignature(rawPayload, signature, activeAppSecret);
      if (!isValid) {
        console.warn(`[WhatsApp Webhook] Firma HMAC-SHA256 inválida rechazada para tenant: ${business.id}`);
        return res.status(401).json({
          success: false,
          error: 'INVALID_SIGNATURE',
          message: 'La firma del webhook no coincide con el App Secret configurado en Meta.',
        });
      }
    } else if (signature) {
      // Si el cliente envía una firma explícita para verificar integridad:
      const rawPayload = req.rawBody || JSON.stringify(req.body);
      const fallbackSecret = config.whatsapp.appSecret || 'changared_default_app_secret';
      const isValid = whatsappService.validateSignature(rawPayload, signature, fallbackSecret);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'INVALID_SIGNATURE',
          message: 'La firma criptográfica proporcionada es inválida.',
        });
      }
    }

    // 3. Manejo de eventos de estado de entrega de Meta (sent, delivered, read, failed)
    const statuses = req.body.entry?.[0]?.changes?.[0]?.value?.statuses;
    if (Array.isArray(statuses) && statuses.length > 0) {
      for (const st of statuses) {
        await conversationRepository.updateDeliveryStatus(st.id, st.status, st.timestamp);
      }
      console.log(`[WhatsApp Webhook] Estados de entrega actualizados (${statuses.length} eventos).`);
      return res.status(200).json({
        success: true,
        event: 'status_update',
        count: statuses.length,
        message: 'Estados de entrega de Meta actualizados exitosamente en el historial.',
      });
    }

    // 4. Extraer remitente, nombre y texto del mensaje
    const { sender, customerName, messageText, metaIncomingId } = extractMessagePayload(req.body);

    if (!messageText) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_MESSAGE',
        message: 'No se detectó ningún texto en el cuerpo de la petición. Envía { "message": "tu texto" } o el formato oficial de WhatsApp.',
      });
    }

    // 5. Deduplicación / Idempotencia: evitar procesar mensajes duplicados de Meta
    if (metaIncomingId && (await conversationRepository.hasProcessedMessage(metaIncomingId))) {
      console.log(`[WhatsApp Webhook] Mensaje duplicado detectado [${metaIncomingId}]. Retornando 200 sin reprocesar.`);
      return res.status(200).json({
        success: true,
        duplicate: true,
        messageId: metaIncomingId,
        message: 'Mensaje duplicado ya procesado anteriormente.',
      });
    }

    console.log(`[WhatsApp Webhook] Mensaje recibido para tenant ${business.id} de ${maskPhone(sender)}`);

    // 5. Obtener o crear la conversación en la persistencia dual (JSON + MongoDB)
    const conversation = await conversationRepository.getOrCreate(business.id, sender, customerName);

    // 6. Registrar el mensaje entrante del cliente en el historial de la conversación
    await conversationRepository.addMessage({
      businessId: business.id,
      customerPhone: sender,
      customerName,
      sender: 'customer',
      text: messageText,
      metaMessageId: metaIncomingId,
    });

    // 7. Evaluar si la conversación está en control humano (IA pausada)
    if (conversation.status === 'human_takeover') {
      console.log(`[WhatsApp Webhook] Conversación con ${maskPhone(sender)} está en modo 'human_takeover' (Pausada). La IA se silencia.`);
      return res.status(200).json({
        success: true,
        status: 'human_takeover',
        aiMuted: true,
        tenant: {
          businessId: business.id,
          businessName: business.name,
        },
        customer: {
          from: sender,
          name: customerName,
          messageReceived: messageText,
        },
        message: 'Mensaje recibido y guardado en la bandeja. La IA está silenciada porque un operador humano tiene el control de la conversación.',
        agentResponse: null,
      });
    }

    // 8. Conversación activa con IA: Generar respuesta inteligente con contexto inyectado
    const aiResult = await agentBrainService.generateReply(business, messageText, sender, { takeOrders: Boolean(activeAppSecret && signature && metaIncomingId && metaPhoneNumberId), sourceId: metaIncomingId, history: (conversation.messages || []).slice(-12) });

    // 9. Enviar la respuesta directamente al WhatsApp del cliente vía WhatsApp Cloud API de Meta
    const waDelivery = await whatsappService.sendTextMessage({
      to: sender,
      text: aiResult.reply,
      business,
    });

    // 10. Registrar la respuesta de la IA en el historial de la conversación
    await conversationRepository.addMessage({
      businessId: business.id,
      customerPhone: sender,
      customerName,
      sender: 'ai',
      text: aiResult.reply,
      metaMessageId: waDelivery.messageId,
      simulated: waDelivery.simulated,
    });

    // 11. Retornar la respuesta estructurada
    return res.status(200).json({
      success: true,
      status: 'ai_active',
      tenant: {
        businessId: business.id,
        businessName: business.name,
      },
      customer: {
        from: sender,
        name: customerName,
        messageReceived: messageText,
      },
      agentResponse: {
        text: aiResult.reply,
        model: aiResult.model,
        latencyMs: aiResult.executionTimeMs,
      },
      whatsappDelivery: {
        sent: waDelivery.sent,
        simulated: waDelivery.simulated,
        messageId: waDelivery.messageId,
        to: waDelivery.to,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Normaliza y extrae el mensaje tanto de llamadas de prueba directas como de webhooks oficiales de Meta.
 */
function extractMessagePayload(body) {
  // Caso 1: Payload directo de prueba JSON: { "from": "+54911...", "message": "Hola", "name": "Juan" }
  if (body.message) {
    return {
      sender: body.from || body.sender || 'Cliente_Web',
      customerName: body.name || body.customerName || '',
      messageText: String(body.message).trim(),
      metaIncomingId: body.id || '',
    };
  }

  // Caso 2: Estructura oficial de Meta WhatsApp Cloud API
  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const contact = value?.contacts?.[0];
  const messageObj = value?.messages?.[0];

  if (messageObj && messageObj.type === 'text') {
    return {
      sender: messageObj.from,
      customerName: contact?.profile?.name || '',
      messageText: messageObj.text?.body?.trim() || '',
      metaIncomingId: messageObj.id || '',
    };
  }

  return { sender: 'Desconocido', customerName: '', messageText: '', metaIncomingId: '' };
}
