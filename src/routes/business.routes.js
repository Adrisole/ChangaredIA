import { Router } from 'express';
import crypto from 'node:crypto';
import { agentBrainService } from '../services/agentBrain.service.js';
import { sellerOrdersService } from '../services/sellerOrders.service.js';
import { businessService } from '../services/business.service.js';
import { businessRepository } from '../repositories/business.repository.js';
import { whatsappService } from '../services/whatsapp.service.js';
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

// El dueño puede completar datos faltantes antes de pedir o verificar el pago.
router.patch('/:businessId/orders/:orderId', authenticate, requireBusinessOwner, async (req, res) => {
  try {
    const order = await sellerOrdersService.updateDetails(req.params.businessId, req.params.orderId, req.body || {});
    res.json({ success: true, order });
  } catch (error) { res.status(409).json({ success: false, message: error.message }); }
});

// Operación posterior al pago: preparar, despachar, entregar o cancelar.
router.post('/:businessId/orders/:orderId/status', authenticate, requireBusinessOwner, async (req, res) => {
  try {
    const order = await sellerOrdersService.updateStatus(req.params.businessId, req.params.orderId, req.body?.status);
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
    if (result.model === 'SAFE_FALLBACK') {
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

// El dueño dispara explícitamente una prueba a un número habilitado en Meta.
// Guardar credenciales no equivale a que Meta acepte ni entregue mensajes.
router.post('/:businessId/whatsapp-test', authenticate, requireBusinessOwner, async (req, res, next) => {
  try {
    const to = String(req.body?.to || '').replace(/[^\d]/g, '');
    if (to.length < 8 || to.length > 16) {
      return res.status(400).json({ success: false, message: 'Ingresá un número de prueba válido con código de país.' });
    }

    const result = await whatsappService.sendTextMessage({
      business: req.business,
      to,
      text: `Prueba de conexión de Changared para ${req.business.name}. Si recibís este mensaje, Meta aceptó el envío.`,
    });

    if (result.simulated) {
      return res.status(409).json({ success: false, status: 'NOT_CONFIGURED', message: 'Faltan credenciales de Meta Cloud API; no se envió ningún WhatsApp.' });
    }
    if (!result.sent) {
      return res.status(502).json({ success: false, status: 'FAILED', message: result.error?.message || 'Meta rechazó el mensaje de prueba.' });
    }

    return res.json({ success: true, status: 'TEST_MESSAGE_ACCEPTED', message: 'Meta aceptó el mensaje de prueba. Revisá el teléfono destinatario para confirmar la recepción.', messageId: result.messageId });
  } catch (error) {
    next(error);
  }
});

// Consultar un negocio por su ID (sanitizado sin exponer token en texto plano)
router.get('/:businessId', authenticate, getBusiness);

export default router;
