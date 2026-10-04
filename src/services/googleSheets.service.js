import fs from 'fs';
import path from 'path';
import { validateCuit, validateAmounts, detectDuplicate } from './fiscalValidator.service.js';

/**
 * Servicio de Gestión y Centralización de Comprobantes para el Libro IVA del Contador.
 * Administra el almacenamiento estructurado, validaciones fiscales, control de duplicados y auditoría.
 */
class GoogleSheetsService {
  constructor() {
    this.invoicesFilePath = path.resolve('./src/data/invoices.json');
    this._ensureFile();
  }

  _ensureFile() {
    const dir = path.dirname(this.invoicesFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.invoicesFilePath)) {
      // Pre-sembrar con 2 facturas de demostración identificadas claramente
      const initial = [
        {
          id: 'INV-DEMO-01',
          businessId: 'mi-empresa',
          fecha: '2026-10-01',
          proveedor: 'Telecom Argentina S.A.',
          cuit: '30-63945373-8',
          tipoComprobante: 'Factura A',
          numeroComprobante: '0012-00045891',
          netoGravado: 42000.0,
          alicuotaIva: '21%',
          importeIva: 8820.0,
          percepcionesOtrosImpuestos: 1200.0,
          total: 52020.0,
          categoriaGasto: 'Servicios',
          resumen: 'Conectividad a internet local comercial.',
          status: 'pending',
          isDemo: true,
          fileName: 'Factura_Telecom_Octubre_2026.pdf',
          source: 'DEMO',
          auditTrail: [
            {
              timestamp: '2026-10-01T14:22:00.000Z',
              action: 'CREATED',
              details: 'Comprobante de demostración pre-cargado para evaluación',
            },
          ],
          processedAt: '2026-10-01T14:22:00.000Z',
        },
        {
          id: 'INV-DEMO-02',
          businessId: 'mi-empresa',
          fecha: '2026-10-02',
          proveedor: 'Edenor S.A.',
          cuit: '30-65511620-2',
          tipoComprobante: 'Factura A',
          numeroComprobante: '0004-00124890',
          netoGravado: 78500.0,
          alicuotaIva: '27%',
          importeIva: 21195.0,
          percepcionesOtrosImpuestos: 3420.0,
          total: 103115.0,
          categoriaGasto: 'Luz/Gas/Tel',
          resumen: 'Suministro eléctrico período Septiembre/Octubre.',
          status: 'pending',
          isDemo: true,
          fileName: 'Factura_Edenor_Octubre_2026.pdf',
          source: 'DEMO',
          auditTrail: [
            {
              timestamp: '2026-10-02T10:15:00.000Z',
              action: 'CREATED',
              details: 'Comprobante de demostración pre-cargado para evaluación',
            },
          ],
          processedAt: '2026-10-02T10:15:00.000Z',
        },
      ];
      fs.writeFileSync(this.invoicesFilePath, JSON.stringify(initial, null, 2), 'utf-8');
    }
  }

  _readAll() {
    try {
      this._ensureFile();
      const raw = fs.readFileSync(this.invoicesFilePath, 'utf-8');
      return JSON.parse(raw || '[]');
    } catch {
      return [];
    }
  }

  _saveAll(data) {
    fs.writeFileSync(this.invoicesFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Agrega un nuevo comprobante con validación fiscal y control de duplicados.
   */
  appendInvoice(businessId, invoiceData, meta = {}) {
    const all = this._readAll();
    const existingForBiz = all.filter((inv) => inv.businessId === businessId);

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
      businessId,
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

    all.unshift(entry);
    this._saveAll(all);

    console.log(`[AccountingService] Nuevo comprobante guardado para [${businessId}]: ${entry.proveedor} ($${entry.total}) [${entry.status}]`);
    return entry;
  }

  /**
   * Actualiza los datos de un comprobante existente y registra la auditoría.
   */
  updateInvoice(businessId, invoiceId, updates, meta = {}) {
    const all = this._readAll();
    const idx = all.findIndex((i) => i.id === invoiceId && (i.businessId === businessId || !businessId));
    if (idx === -1) return null;

    const current = all[idx];
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

    all[idx] = updated;
    this._saveAll(all);
    return updated;
  }

  /**
   * Elimina un comprobante específico por ID.
   */
  deleteInvoice(businessId, invoiceId) {
    const all = this._readAll();
    const idx = all.findIndex((i) => i.id === invoiceId && (i.businessId === businessId || !businessId));
    if (idx === -1) return false;

    const removed = all.splice(idx, 1)[0];
    this._saveAll(all);
    console.log(`[AccountingService] Comprobante ${invoiceId} eliminado para [${businessId}]`);
    return removed;
  }

  /**
   * Elimina todos los comprobantes del negocio, o únicamente los de demostración.
   */
  clearInvoices(businessId, { onlyDemo = false } = {}) {
    const all = this._readAll();
    const remaining = all.filter((i) => {
      if (businessId && i.businessId !== businessId) return true;
      if (onlyDemo) return !i.isDemo;
      return false; // borrar todos los de este businessId
    });

    const deletedCount = all.length - remaining.length;
    this._saveAll(remaining);
    console.log(`[AccountingService] Se eliminaron ${deletedCount} comprobantes para [${businessId}] (onlyDemo=${onlyDemo})`);
    return { deletedCount };
  }

  getInvoices(businessId, filters = {}) {
    const all = this._readAll();
    let list = businessId ? all.filter((inv) => inv.businessId === businessId) : all;

    if (filters.status) {
      list = list.filter((inv) => inv.status === filters.status);
    }
    return list;
  }

  getStats(businessId) {
    const list = this.getInvoices(businessId);
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
