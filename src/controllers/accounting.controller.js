import { invoiceExtractorService } from '../services/invoiceExtractor.service.js';
import { googleSheetsService } from '../services/googleSheets.service.js';
import { validateCuit, validateAmounts } from '../services/fiscalValidator.service.js';

/**
 * Controlador de Preparación de Comprobantes para el Estudio Contable / Libro IVA.
 */

export const processInboundEmail = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { from, subject, text, rawContent, attachmentName } = req.body;

    console.log(`[Accounting Assistant] Email recibido para [${businessId}] de: ${from || 'proveedor@test.com'}`);

    const invoiceContent = rawContent || text || subject || 'Factura de servicios';
    const extractedData = await invoiceExtractorService.extractInvoiceData(invoiceContent);

    const record = googleSheetsService.appendInvoice(businessId, extractedData, {
      from,
      subject,
      attachmentName,
      source: 'EMAIL',
    });

    return res.status(200).json({
      success: true,
      message: `Comprobante de ${extractedData.proveedor} ingresado a la bandeja de revisión.`,
      data: {
        record,
        googleSheetsStatus: 'ROW_APPENDED',
        status: record.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getInvoicesList = (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { status } = req.query; // 'pending' | 'approved' | undefined
    const invoices = googleSheetsService.getInvoices(businessId, { status });
    const stats = googleSheetsService.getStats(businessId);

    res.status(200).json({
      success: true,
      businessId,
      stats,
      invoices,
    });
  } catch (error) {
    next(error);
  }
};

export const simulateInvoiceReception = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { providerType } = req.body; // 'edenor' | 'telecom' | 'lacteos'

    let simulatedText = 'Factura Telecom internet abono comercial';
    let from = 'facturas@telecom.com.ar';
    let subject = 'Factura Digital Telecom - Período Octubre 2026';
    let attachmentName = 'Telecom_Factura_A.pdf';

    if (providerType === 'edenor') {
      simulatedText = 'Factura Edenor electricidad comercio centro';
      from = 'facturacion@edenor.com.ar';
      subject = 'Aviso de Factura Edenor Octubre';
      attachmentName = 'Edenor_Factura_Luz.pdf';
    } else if (providerType === 'lacteos') {
      simulatedText = 'Factura Distribuidora Lácteos del Centro insumos muzzarella';
      from = 'ventas@lacteosdelcentro.com.ar';
      subject = 'Comprobante de compra insumos gastronomía';
      attachmentName = 'Lacteos_Factura_Insumos.pdf';
    }

    const extracted = await invoiceExtractorService.extractInvoiceData(simulatedText);
    const record = googleSheetsService.appendInvoice(
      businessId,
      { ...extracted, isDemo: true },
      {
        from,
        subject,
        attachmentName,
        source: 'DEMO',
        isDemo: true,
      }
    );

    res.status(200).json({
      success: true,
      message: `Ejemplo de demostración (${extracted.proveedor}) agregado a la bandeja de revisión.`,
      record,
    });
  } catch (error) {
    next(error);
  }
};

export const createInvoice = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const body = req.body || {};

    const proveedor = body.proveedor || body.provider;
    const total = Number(body.total);

    if (!proveedor || isNaN(total) || total <= 0) {
      return res.status(400).json({
        success: false,
        error: 'El proveedor y el monto total son obligatorios y deben ser válidos.',
      });
    }

    const invoiceData = {
      proveedor,
      cuit: body.cuit,
      fecha: body.fecha || body.date,
      tipoComprobante: body.tipoComprobante || body.invoiceType || 'Factura A',
      numeroComprobante: body.numeroComprobante || body.invoiceNumber || '0001-00000001',
      netoGravado: Number(body.netoGravado ?? body.neto) || 0,
      alicuotaIva: body.alicuotaIva || (body.alicuota ? `${body.alicuota}%` : '21%'),
      importeIva: Number(body.importeIva ?? body.iva) || 0,
      percepcionesOtrosImpuestos: Number(body.percepcionesOtrosImpuestos ?? body.percepciones) || 0,
      total,
      moneda: body.moneda || 'ARS',
      categoriaGasto: body.categoriaGasto || body.category || 'General',
      cae: body.cae || '',
      resumen: body.resumen || '',
      status: body.status || 'pending',
      isDemo: Boolean(body.isDemo),
      fileName: body.fileName || 'Carga manual',
    };

    const record = googleSheetsService.appendInvoice(businessId, invoiceData, {
      source: body.source || 'MANUAL_ENTRY',
      attachmentName: body.fileName || 'Carga manual',
    });

    const fiscalVal = validateCuit(record.cuit);

    res.status(201).json({
      success: true,
      message: `Comprobante de ${record.proveedor} registrado exitosamente.`,
      record,
      fiscalValidation: {
        isValidCuit: fiscalVal.valid,
        formattedCuit: fiscalVal.formatted,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateInvoice = async (req, res, next) => {
  try {
    const { businessId, invoiceId } = req.params;
    const updates = req.body;

    const record = googleSheetsService.updateInvoice(businessId, invoiceId, updates, {
      reason: updates.auditReason,
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Comprobante no encontrado.',
      });
    }

    res.status(200).json({
      success: true,
      message: `Comprobante actualizado correctamente.`,
      record,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteInvoice = async (req, res, next) => {
  try {
    const { businessId, invoiceId } = req.params;
    const removed = googleSheetsService.deleteInvoice(businessId, invoiceId);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Comprobante no encontrado para eliminar.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Comprobante eliminado del Libro IVA.',
      removed,
    });
  } catch (error) {
    next(error);
  }
};

export const clearInvoices = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const onlyDemo = req.query.onlyDemo === 'true' || req.body?.onlyDemo === true;

    const result = googleSheetsService.clearInvoices(businessId, { onlyDemo });

    res.status(200).json({
      success: true,
      message: onlyDemo
        ? `Se eliminaron ${result.deletedCount} comprobantes de prueba.`
        : `Se vació la lista de comprobantes (${result.deletedCount} eliminados).`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

export const validateCuitEndpoint = (req, res) => {
  const { cuit } = req.body;
  const result = validateCuit(cuit);
  res.status(200).json(result);
};
