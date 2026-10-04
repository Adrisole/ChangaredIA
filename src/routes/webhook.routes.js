import { Router } from 'express';
import { verifyWebhook, handleIncomingMessage } from '../controllers/webhook.controller.js';

const router = Router();

// Verificación de webhook global para Meta WhatsApp Cloud API (GET /api/webhook)
router.get('/', verifyWebhook);

// Recepción de mensajes global identificando por phone_number_id de Meta (POST /api/webhook)
router.post('/', handleIncomingMessage);

// Verificación de webhook para tenant específico (GET /api/webhook/:businessId)
router.get('/:businessId', verifyWebhook);

// Recepción y procesamiento de mensajes para tenant específico o por phone_number_id (POST /api/webhook/:businessId)
router.post('/:businessId', handleIncomingMessage);

export default router;
