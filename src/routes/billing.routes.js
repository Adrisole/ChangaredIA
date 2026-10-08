import { Router } from 'express';
import {
  handleLemonSqueezyWebhook,
  handleMercadoPagoBillingWebhook,
  getPlansCatalog,
  createCheckout,
  confirmManualPayment,
} from '../controllers/billing.controller.js';

const router = Router();

// Catálogo de planes y métodos de pago habilitados
router.get('/plans', getPlansCatalog);

// Checkout: Mercado Pago (LATAM) o instrucciones Wise/Payoneer (USD)
router.post('/checkout', createCheckout);

// Confirmación manual de pagos Wise/Payoneer (x-admin-key)
router.post('/confirm-manual', confirmManualPayment);

// Webhooks de cobro
router.post('/webhook/lemonsqueezy', handleLemonSqueezyWebhook); // legado
router.post('/webhook/mercadopago', handleMercadoPagoBillingWebhook);

export default router;
