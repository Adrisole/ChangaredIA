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
import { authenticate, requireBusinessOwner } from '../middlewares/auth.middleware.js';

const router = Router();

// La recepción automática por email queda deshabilitada hasta integrar un
// proveedor que firme los eventos. Nunca se expone una escritura pública.
router.post('/inbound-email/:businessId', authenticate, requireBusinessOwner, processInboundEmail);

// Endpoint para consultar facturas procesadas y estadísticas para el contador
router.get('/invoices/:businessId', authenticate, requireBusinessOwner, getInvoicesList);

// Endpoint para crear un comprobante manual o importado
router.post('/invoices/:businessId', authenticate, requireBusinessOwner, createInvoice);

// Endpoint para editar / aprobar un comprobante
router.put('/invoices/:businessId/:invoiceId', authenticate, requireBusinessOwner, updateInvoice);

// Endpoint para eliminar un comprobante específico
router.delete('/invoices/:businessId/:invoiceId', authenticate, requireBusinessOwner, deleteInvoice);

// Endpoint para vaciar comprobantes (o sólo los de demo con ?onlyDemo=true)
router.delete('/invoices/:businessId', authenticate, requireBusinessOwner, clearInvoices);

// Endpoint para simular recepción de factura en el panel
router.post('/simulate-email/:businessId', authenticate, requireBusinessOwner, simulateInvoiceReception);

// Endpoint de utilidad para validar CUIT
router.post('/validate-cuit', validateCuitEndpoint);

export default router;
