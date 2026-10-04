import { Router } from 'express';
import {
  listConversations,
  getConversation,
  toggleAiStatus,
  sendHumanMessage,
} from '../controllers/conversation.controller.js';
import { authenticate, requireBusinessOwner } from '../middlewares/auth.middleware.js';

const router = Router();

// Listar todas las conversaciones de un negocio (protegido por autenticación y propiedad)
router.get('/:businessId', authenticate, requireBusinessOwner, listConversations);

// Obtener detalle de una conversación específica con un cliente (protegido por autenticación y propiedad)
router.get('/:businessId/:customerPhone', authenticate, requireBusinessOwner, getConversation);

// Pausar o Reactivar IA para una conversación ("Pausar IA / Responder yo") (protegido)
router.post('/:businessId/:customerPhone/toggle-ai', authenticate, requireBusinessOwner, toggleAiStatus);

// Enviar mensaje como operador humano a WhatsApp (silencia la IA automáticamente) (protegido)
router.post('/:businessId/:customerPhone/send', authenticate, requireBusinessOwner, sendHumanMessage);

export default router;
