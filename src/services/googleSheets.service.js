import { validateCuit, validateAmounts, detectDuplicate } from './fiscalValidator.service.js';
import { invoiceRepository } from '../repositories/invoice.repository.js';

/**
 * Servicio de comprobantes para preparar la información que recibe el contador.
 * El nombre histórico se conserva para no romper imports, pero no promete una
 * integración con Google Sheets: los datos quedan en la cuenta del negocio.
 */
class GoogleSheetsService {
  /**
   * Agrega un nuevo comprobante con validación fiscal y control de duplicados.
   */
  async appendInvoice(businessId, invoiceData, meta = {}) {
    const normalizedBusinessId = String(businessId || '').toLowerCase().trim();
    const existingForBiz = await invoiceRepository.findByBusinessId(normalizedBusinessId);

    // Validación fiscal del CUIT
    const cuitValidation = validateCuit(invoiceData.cuit);

    // Control de duplicados
    const dupCheck = detectDuplicate(existingForBiz, invoiceData);

    const id = invoiceData.id || `INV-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const nowIso = new Date().toISOString();

    const auditTrail = [
      {
        timestamp: nowIso,
        action: 'CREATED',
        details: meta.auditReason || `Comprobante ingresado al sistema vía ${meta.source || 'Carga Directa'}.`,
      },
    ];

    if (dupCheck.isDuplicate) {
      auditTrail.push({
        timestamp: nowIso,
        action: 'DUPLICATE_WARNING',
        details: dupCheck.reason,
      });
    }

    const entry = {
      id,
      businessId: normalizedBusinessId,
      fecha: invoiceData.fecha || nowIso.split('T')[0],
      proveedor: String(invoiceData.proveedor || 'Proveedor General').trim(),
      cuit: cuitValidation.formatted || invoiceData.cuit || '',
      cuitValid: cuitValidation.valid,
      tipoComprobante: invoiceData.tipoComprobante || 'Factura A',
      numeroComprobante: invoiceData.numeroComprobante || '0001-00000001',
      netoGravado: Number(invoiceData.netoGravado) || 0,
      alicuotaIva: invoiceData.alicuotaIva || '21%',
      importeIva: Number(invoiceData.importeIva) || 0,
      percepcionesOtrosImpuestos: Number(invoiceData.percepcionesOtrosImpuestos) || 0,
      total: Number(invoiceData.total) || 0,
      moneda: invoiceData.moneda || 'ARS',
      categoriaGasto: invoiceData.categoriaGasto || 'General',
      cae: invoiceData.cae || '',
      resumen: invoiceData.resumen || '',
      status: invoiceData.status || 'pending', // 'pending' | 'approved'
      isDemo: Boolean(invoiceData.isDemo || meta.isDemo),
      fileName: meta.attachmentName || meta.fileName || invoiceData.fileName || 'comprobante_adjunto.pdf',
      source: meta.source || (meta.from ? 'EMAIL' : 'MANUAL_UPLOAD'),
      duplicateWarning: dupCheck.isDuplicate ? dupCheck.reason : null,
      auditTrail,
      processedAt: nowIso,
    };

    const saved = await invoiceRepository.save(entry);
    console.log(`[AccountingService] Nuevo comprobante guardado para [${normalizedBusinessId}]: ${saved.proveedor} ($${saved.total}) [${saved.status}]`);
    return saved;
  }

  /**
   * Actualiza los datos de un comprobante existente y registra la auditoría.
   */
  async updateInvoice(businessId, invoiceId, updates, meta = {}) {
    const current = await invoiceRepository.findById(businessId, invoiceId);
    if (!current) return null;
    const nowIso = new Date().toISOString();
    const trail = Array.isArray(current.auditTrail) ? [...current.auditTrail] : [];

    let action = 'EDITED';
    let details = meta.reason || 'Datos fiscales corregidos manualmente.';

    if (updates.status && updates.status !== current.status) {
      if (updates.status === 'approved') {
        action = 'APPROVED';
        details = 'Comprobante revisado y aprobado para el Libro IVA del contador.';
      } else if (updates.status === 'pending') {
        action = 'REOPENED';
        details = 'Comprobante devuelto a estado pendiente de revisión.';
      }
    }

    trail.push({ timestamp: nowIso, action, details });

    // Si se actualizó el CUIT, re-validarlo
    let cuitValid = current.cuitValid;
    let cuitFormatted = updates.cuit || current.cuit;
    if (updates.cuit) {
      const v = validateCuit(updates.cuit);
      cuitValid = v.valid;
      cuitFormatted = v.formatted || updates.cuit;
    }

    const updated = {
      ...current,
      ...updates,
      cuit: cuitFormatted,
      cuitValid,
      netoGravado: updates.netoGravado !== undefined ? Number(updates.netoGravado) : current.netoGravado,
      importeIva: updates.importeIva !== undefined ? Number(updates.importeIva) : current.importeIva,
      percepcionesOtrosImpuestos: updates.percepcionesOtrosImpuestos !== undefined ? Number(updates.percepcionesOtrosImpuestos) : current.percepcionesOtrosImpuestos,
      total: updates.total !== undefined ? Number(updates.total) : current.total,
      auditTrail: trail,
      updatedAt: nowIso,
    };

    return await invoiceRepository.save(updated);
  }

  /**
   * Elimina un comprobante específico por ID.
   */
  async deleteInvoice(businessId, invoiceId) {
    const removed = await invoiceRepository.deleteById(businessId, invoiceId);
    if (!removed) return null;
    console.log(`[AccountingService] Comprobante ${invoiceId} eliminado para [${businessId}]`);
    return removed;
  }

  /**
   * Elimina todos los comprobantes del negocio, o únicamente los de demostración.
   */
  async clearInvoices(businessId, { onlyDemo = false } = {}) {
    const result = await invoiceRepository.clear(businessId, { onlyDemo });
    const { deletedCount } = result;
    console.log(`[AccountingService] Se eliminaron ${deletedCount} comprobantes para [${businessId}] (onlyDemo=${onlyDemo})`);
    return { deletedCount };
  }

  async getInvoices(businessId, filters = {}) {
    return await invoiceRepository.findByBusinessId(businessId, filters);
  }

  async getStats(businessId) {
    const list = await this.getInvoices(businessId);
    const pendingCount = list.filter((i) => i.status === 'pending').length;
    const approvedCount = list.filter((i) => i.status === 'approved').length;
    const demoCount = list.filter((i) => i.isDemo).length;

    const totalCompras = list.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const totalNeto = list.reduce((sum, i) => sum + (Number(i.netoGravado) || 0), 0);
    const totalIva = list.reduce((sum, i) => sum + (Number(i.importeIva) || 0), 0);

    return {
      count: list.length,
      pendingCount,
      approvedCount,
      demoCount,
      totalCompras,
      totalNeto,
      totalIva,
      sheetName: `Libro_IVA_Compras_${new Date().getFullYear()}`,
    };
  }
}

export const googleSheetsService = new GoogleSheetsService();
