import mongoose from 'mongoose';

const auditItemSchema = new mongoose.Schema({
  timestamp: { type: String, required: true },
  action: { type: String, required: true },
  details: { type: String, default: '' },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  businessId: { type: String, required: true, index: true },
  fecha: { type: String, required: true },
  proveedor: { type: String, required: true },
  cuit: { type: String, default: '' },
  cuitValid: { type: Boolean, default: false },
  tipoComprobante: { type: String, default: 'Factura A' },
  numeroComprobante: { type: String, default: '' },
  netoGravado: { type: Number, default: 0 },
  alicuotaIva: { type: String, default: '21%' },
  importeIva: { type: Number, default: 0 },
  percepcionesOtrosImpuestos: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  moneda: { type: String, default: 'ARS' },
  categoriaGasto: { type: String, default: 'General' },
  cae: { type: String, default: '' },
  resumen: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved'], default: 'pending' },
  isDemo: { type: Boolean, default: false },
  fileName: { type: String, default: '' },
  source: { type: String, default: 'MANUAL_ENTRY' },
  duplicateWarning: { type: String, default: null },
  auditTrail: { type: [auditItemSchema], default: [] },
  processedAt: { type: String },
  updatedAt: { type: String },
}, { timestamps: true });

invoiceSchema.index({ businessId: 1, fecha: -1 });

export const InvoiceModel = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
