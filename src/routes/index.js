import { Router } from 'express';
import businessRoutes from './business.routes.js';
import webhookRoutes from './webhook.routes.js';
import billingRoutes from './billing.routes.js';
import { businessService } from '../services/business.service.js';
import { config } from '../config/env.js';

const apiRouter = Router();

// Endpoint de diagnóstico rápido de Changared
apiRouter.get('/status', (req, res) => {
  const businesses = businessService.getAllBusinesses();
  res.status(200).json({
    status: 'ONLINE',
    platform: 'Changared - Empleados Virtuales Multi-Tenant',
    version: '1.0.0',
    tenantsCount: businesses.length,
    openai: {
      model: config.openai.model,
      configured: Boolean(config.openai.apiKey),
    },
    timestamp: new Date().toISOString(),
  });
});

// Rutas de onboarding y gestión de negocios
apiRouter.use('/business', businessRoutes);

// Rutas de webhooks de WhatsApp por negocio (/api/webhook/:businessId)
apiRouter.use('/webhook', webhookRoutes);

// Rutas de facturación y cobro (Mercado Pago y Lemon Squeezy)
apiRouter.use('/billing', billingRoutes);

export default apiRouter;
