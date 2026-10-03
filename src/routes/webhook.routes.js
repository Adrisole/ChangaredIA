import { Router } from 'express';
import { verifyWebhook, handleIncomingMessage } from '../controllers/webhook.controller.js';

const router = Router();

// Verificación de webhook para Meta WhatsApp Cloud API (GET)
router.get('/:businessId', verifyWebhook);

// Recepción y procesamiento de mensajes de clientes (POST)
router.post('/:businessId', handleIncomingMessage);

export default router;
