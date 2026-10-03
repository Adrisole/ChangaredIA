import { Router } from 'express';
import {
  handleLemonSqueezyWebhook,
  handleMercadoPagoBillingWebhook,
  getPlansCatalog,
} from '../controllers/billing.controller.js';

const router = Router();

// Catálogo de planes
router.get('/plans', getPlansCatalog);

// Webhooks de cobro
router.post('/webhook/lemonsqueezy', handleLemonSqueezyWebhook);
router.post('/webhook/mercadopago', handleMercadoPagoBillingWebhook);

export default router;
