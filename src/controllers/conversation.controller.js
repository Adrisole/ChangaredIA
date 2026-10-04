import { conversationRepository } from '../repositories/conversation.repository.js';
import { businessService } from '../services/business.service.js';
import { whatsappService } from '../services/whatsapp.service.js';

/**
 * Controlador de Gestión de Conversaciones y Bandeja Inbox con Control Humano.
 */

export const listConversations = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const conversations = await conversationRepository.findByBusinessId(businessId);

    res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations,
    });
  } catch (error) {
    next(error);
  }
};

export const getConversation = async (req, res, next) => {
  try {
    const { businessId, customerPhone } = req.params;
    const conversation = await conversationRepository.findByCustomer(businessId, customerPhone);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `No se encontró historial para el cliente '${customerPhone}'.`,
      });
    }

    // Marcar como leídos los mensajes si los abre el operador
    await conversationRepository.markAsRead(businessId, customerPhone);

    res.status(200).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleAiStatus = async (req, res, next) => {
  try {
    const { businessId, customerPhone } = req.params;
    const { status } = req.body;

    const current = await conversationRepository.findByCustomer(businessId, customerPhone);
    let nextStatus = status;

    if (!nextStatus) {
      nextStatus = current && current.status === 'human_takeover' ? 'ai_active' : 'human_takeover';
    }

    if (!['ai_active', 'human_takeover'].includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_STATUS',
        message: "El estado debe ser 'ai_active' o 'human_takeover'.",
      });
    }

    const updated = await conversationRepository.setStatus(businessId, customerPhone, nextStatus);

    res.status(200).json({
      success: true,
      message: nextStatus === 'human_takeover'
        ? 'IA silenciada. El operador humano tiene el control de la conversación.'
        : 'IA reactivada. El agente volverá a responder automáticamente en WhatsApp.',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const sendHumanMessage = async (req, res, next) => {
  try {
    const { businessId, customerPhone } = req.params;
    const { text } = req.body;

    if (!text || !String(text).trim()) {
      return res.status(400).json({
        success: false,
        error: 'EMPTY_TEXT',
        message: 'El texto del mensaje no puede estar vacío.',
      });
    }

    const business = await businessService.getBusinessById(businessId);
    if (!business) {
      return res.status(404).json({
        success: false,
        error: 'BUSINESS_NOT_FOUND',
        message: `El negocio '${businessId}' no existe.`,
      });
    }

    // 1. Enviar mensaje real a WhatsApp
    const waDelivery = await whatsappService.sendTextMessage({
      to: customerPhone,
      text: String(text).trim(),
      business,
    });

    // 2. Al responder un operador humano, silenciar automáticamente la IA para este chat
    await conversationRepository.setStatus(businessId, customerPhone, 'human_takeover');

    // 3. Registrar el mensaje humano en el historial
    const updated = await conversationRepository.addMessage({
      businessId,
      customerPhone,
      sender: 'human',
      text: String(text).trim(),
      metaMessageId: waDelivery.messageId,
      simulated: waDelivery.simulated,
    });

    res.status(200).json({
      success: true,
      message: 'Mensaje enviado exitosamente al cliente. IA pausada para esta conversación.',
      data: {
        conversation: updated,
        delivery: waDelivery,
      },
    });
  } catch (error) {
    next(error);
  }
};
