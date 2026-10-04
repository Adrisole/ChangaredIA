import { Router } from 'express';
import {
  processInboundEmail,
  getInvoicesList,
  simulateInvoiceReception,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  clearInvoices,
  validateCuitEndpoint,
} from '../controllers/accounting.controller.js';

const router = Router();

// Endpoint para recibir emails entrantes con facturas adjuntas
router.post('/inbound-email/:businessId', processInboundEmail);

// Endpoint para consultar facturas procesadas y estadísticas para el contador
router.get('/invoices/:businessId', getInvoicesList);

// Endpoint para crear un comprobante manual o importado
router.post('/invoices/:businessId', createInvoice);

// Endpoint para editar / aprobar un comprobante
router.put('/invoices/:businessId/:invoiceId', updateInvoice);

// Endpoint para eliminar un comprobante específico
router.delete('/invoices/:businessId/:invoiceId', deleteInvoice);

// Endpoint para vaciar comprobantes (o sólo los de demo con ?onlyDemo=true)
router.delete('/invoices/:businessId', clearInvoices);

// Endpoint para simular recepción de factura en el panel
router.post('/simulate-email/:businessId', simulateInvoiceReception);

// Endpoint de utilidad para validar CUIT
router.post('/validate-cuit', validateCuitEndpoint);

export default router;
