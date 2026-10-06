import { Router } from 'express';
import { agentBrainService } from '../services/agentBrain.service.js';
import {
  setupBusiness,
  getBusiness,
  listBusinesses,
  listMyBusinesses,
  updateWhatsAppConfig,
} from '../controllers/business.controller.js';
import { authenticate, requireAuth, requireBusinessOwner } from '../middlewares/auth.middleware.js';

const router = Router();

// Onboarding de nuevo negocio (requiere autenticación obligatoria y asocia al usuario)
router.post('/setup', authenticate, requireAuth, setupBusiness);

// Consultar los negocios privados del usuario autenticado
router.get('/my', authenticate, requireAuth, listMyBusinesses);

// Prueba privada: usa el negocio del propietario sin enviar mensajes por WhatsApp.
router.post('/:businessId/test-message', authenticate, requireBusinessOwner, async (req, res, next) => {
  try {
    const message = req.body.message;
    if (typeof message !== 'string' || !message.trim() || message.length > 4000) {
      return res.status(400).json({ success: false, message: 'Escribí un mensaje de entre 1 y 4000 caracteres.' });
    }
    const result = await agentBrainService.generateReply(req.business, message.trim(), 'Prueba del propietario');
    if (['SIMULATED_AGENT', 'FALLBACK_SIMULATED'].includes(result.model)) {
      return res.status(503).json({ success: false, message: 'La IA no está disponible en este momento. Revisá la configuración y el saldo de la API e intentá nuevamente.' });
    }
    return res.json({ success: true, reply: result.reply });
  } catch (error) {
    next(error);
  }
});

// Consultar todos los negocios registrados
router.get('/', listBusinesses);

// Actualizar configuración de WhatsApp (número, phone_number_id, token) - Protegido por propiedad
router.post('/:businessId/whatsapp-config', authenticate, requireBusinessOwner, updateWhatsAppConfig);

// Consultar un negocio por su ID (sanitizado sin exponer token en texto plano)
router.get('/:businessId', authenticate, getBusiness);

export default router;
