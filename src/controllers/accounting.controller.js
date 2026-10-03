import { invoiceExtractorService } from '../services/invoiceExtractor.service.js';
import { googleSheetsService } from '../services/googleSheets.service.js';

/**
 * Controlador del Asistente Contable:
 * Procesa facturas entrantes por email, extrae datos con IA, guarda en Drive y añade fila a Sheets.
 */

export const processInboundEmail = async (req, res, next) => {
  try {
    const { businessId } = req.params;
    const { from, subject, text, rawContent, attachmentName } = req.body;

    console.log(`[Accounting Assistant] Email recibido para [${businessId}] de: ${from || 'proveedor@test.com'}`);

    // 1. Extraer datos con IA
    const invoiceContent = rawContent || text || subject || 'Factura de servicios';
    const extractedData = await invoiceExtractorService.extractInvoiceData(invoiceContent);

    // 2. Guardar en Drive y añadir fila a Google Sheets
    const record = googleSheetsService.appendInvoice(businessId, extractedData, {
      from,
      subject,
      attachmentName,
    });

    return res.status(200).json({
      success: true,
      message: `¡Factura de ${extractedData.proveedor} procesada y agregada a tu Google Sheets!`,
      data: {
        record,
        googleSheetsStatus: 'ROW_APPENDED',
        googleDriveStatus: 'PDF_SAVED',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getInvoicesList = (req, res, next) => {
  try {
    const { businessId } = req.params;
    const invoices = googleSheetsService.getInvoices(businessId);
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

    if (providerType === 'edenor') {
      simulatedText = 'Factura Edenor electricidad comercio centro';
      from = 'facturacion@edenor.com.ar';
      subject = 'Aviso de Factura Edenor Octubre';
    } else if (providerType === 'lacteos') {
      simulatedText = 'Factura Distribuidora Lácteos del Centro insumos muzzarella';
      from = 'ventas@lacteosdelcentro.com.ar';
      subject = 'Comprobante de compra insumos gastronomía';
    }

    const extracted = await invoiceExtractorService.extractInvoiceData(simulatedText);
    const record = googleSheetsService.appendInvoice(businessId, extracted, {
      from,
      subject,
    });

    res.status(200).json({
      success: true,
      message: `Factura simulada de ${extracted.proveedor} agregada a Google Sheets.`,
      record,
    });
  } catch (error) {
    next(error);
  }
};
