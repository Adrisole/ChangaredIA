import { Router } from 'express';
import businessRoutes from './business.routes.js';
import webhookRoutes from './webhook.routes.js';
import billingRoutes from './billing.routes.js';
import accountingRoutes from './accounting.routes.js';
import authRoutes from './auth.routes.js';
import appointmentRoutes from './appointment.routes.js';
import chatRoutes from './chat.routes.js';
import conversationRoutes from './conversation.routes.js';
import { businessService } from '../services/business.service.js';
import { config } from '../config/env.js';

const apiRouter = Router();

// Endpoint de diagnóstico rápido de Changared
apiRouter.get('/status', async (req, res) => {
  const businesses = await businessService.getAllBusinesses();
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

// Rutas de autenticación y sesiones de usuario (/api/auth)
apiRouter.use('/auth', authRoutes);

// Rutas de onboarding y gestión de negocios
apiRouter.use('/business', businessRoutes);

// Rutas de webhooks de WhatsApp por negocio (/api/webhook/:businessId)
apiRouter.use('/webhook', webhookRoutes);

// Rutas de facturación y cobro (Mercado Pago y Lemon Squeezy)
apiRouter.use('/billing', billingRoutes);

// Rutas del Asistente Contable (Facturas a Google Drive y Sheets)
apiRouter.use('/accounting', accountingRoutes);

// Rutas de Agenda y Turnos (/api/appointments/:businessId)
apiRouter.use('/appointments', appointmentRoutes);

// Rutas de Conversaciones e Inbox en Vivo con Control Humano (/api/conversations/:businessId)
apiRouter.use('/conversations', conversationRoutes);

// Rutas del Asesor Comercial IA de Changared (/api/chat/changared)
apiRouter.use('/chat', chatRoutes);

export default apiRouter;
