import { Router } from 'express';
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

// Consultar todos los negocios registrados
router.get('/', listBusinesses);

// Actualizar configuración de WhatsApp (número, phone_number_id, token) - Protegido por propiedad
router.post('/:businessId/whatsapp-config', authenticate, requireBusinessOwner, updateWhatsAppConfig);

// Consultar un negocio por su ID (sanitizado sin exponer token en texto plano)
router.get('/:businessId', authenticate, getBusiness);

export default router;
