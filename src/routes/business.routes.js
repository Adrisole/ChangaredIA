import { Router } from 'express';
import crypto from 'node:crypto';
import { agentBrainService } from '../services/agentBrain.service.js';
import { sellerOrdersService } from '../services/sellerOrders.service.js';
import { businessService } from '../services/business.service.js';
import { businessRepository } from '../repositories/business.repository.js';
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

router.put('/:businessId/catalog', authenticate, requireBusinessOwner, async (req, res, next) => {
  try {
    const catalog = req.body.additions;
    if (!Array.isArray(catalog) || catalog.some(p => !p || typeof p.name !== 'string' || !p.name.trim() || !Number.isFinite(p.price) || p.price < 0 || !Number.isInteger(p.stock) || p.stock < 0)) {
      return res.status(400).json({ success: false, message: 'El catálogo necesita nombre, precio válido y stock entero no negativo.' });
    }
    const products = catalog.map(p => ({ id: p.id || crypto.randomUUID(), name: p.name.trim(), price: p.price, stock: p.stock, description: String(p.description || ''), category: String(p.category || 'General') }));
    const business = await businessRepository.appendCatalog(req.business.id, products);
    res.json({ success: true, data: { business: businessService.sanitizeBusiness(business) } });
  } catch (error) { next(error); }
});

router.get('/:businessId/orders', authenticate, requireBusinessOwner, (req, res) => {
  res.json({ success: true, orders: req.business.orders || [], paymentMethod: req.business.paymentMethod || '', notificationPhone: req.business.notificationPhone || '' });
});

router.post('/:businessId/seller-settings', authenticate, requireBusinessOwner, async (req, res, next) => {
  try {
    const { businessService } = await import('../services/business.service.js');
    await businessService.setupBusiness({ id: req.business.id, name: req.business.name, description: req.business.description || 'Negocio', paymentMethod: req.body.paymentMethod, notificationPhone: req.body.notificationPhone }, req.user.id);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.post('/:businessId/orders/:orderId/confirm', authenticate, requireBusinessOwner, async (req, res, next) => {
  try {
    if (req.body.paymentVerified !== true) return res.status(400).json({ success: false, message: 'Verificá la acreditación del pago antes de confirmar.' });
    const order = await sellerOrdersService.confirm(req.params.businessId, req.params.orderId);
    res.json({ success: true, order });
  } catch (error) { res.status(409).json({ success: false, message: error.message }); }
});

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
