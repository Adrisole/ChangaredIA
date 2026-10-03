import { Router } from 'express';
import {
  processInboundEmail,
  getInvoicesList,
  simulateInvoiceReception,
} from '../controllers/accounting.controller.js';

const router = Router();

// Endpoint para recibir emails entrantes con facturas adjuntas
router.post('/inbound-email/:businessId', processInboundEmail);

// Endpoint para consultar facturas procesadas y estadísticas para el contador
router.get('/invoices/:businessId', getInvoicesList);

// Endpoint para simular recepción de factura en el panel
router.post('/simulate-email/:businessId', simulateInvoiceReception);

export default router;
