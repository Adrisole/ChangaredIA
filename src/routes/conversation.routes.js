import { Router } from 'express';
import {
  listConversations,
  getConversation,
  toggleAiStatus,
  sendHumanMessage,
} from '../controllers/conversation.controller.js';

const router = Router();

// Listar todas las conversaciones de un negocio
router.get('/:businessId', listConversations);

// Obtener detalle de una conversación específica con un cliente
router.get('/:businessId/:customerPhone', getConversation);

// Pausar o Reactivar IA para una conversación ("Pausar IA / Responder yo")
router.post('/:businessId/:customerPhone/toggle-ai', toggleAiStatus);

// Enviar mensaje como operador humano a WhatsApp (silencia la IA automáticamente)
router.post('/:businessId/:customerPhone/send', sendHumanMessage);

export default router;
