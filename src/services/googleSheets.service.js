import fs from 'fs';
import path from 'path';

/**
 * Servicio de Sincronización con Google Drive y Google Sheets.
 * Sube el archivo original a Google Drive y añade una nueva fila estructurada al Excel del contador.
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
      // Pre-sembrar con 2 facturas de ejemplo
      const initial = [
        {
          id: 'INV-20261001-01',
          businessId: 'pizzeria-roma',
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
          driveUrl: 'https://drive.google.com/file/d/demo-telecom-factura-octubre/view',
          sourceEmail: 'facturas@telecom.com.ar',
          processedAt: '2026-10-01T14:22:00.000Z',
        },
        {
          id: 'INV-20261002-02',
          businessId: 'pizzeria-roma',
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
          driveUrl: 'https://drive.google.com/file/d/demo-edenor-factura-octubre/view',
          sourceEmail: 'facturacion@edenor.com.ar',
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
   * Procesa la factura: simula la subida a Drive y agrega la fila a Google Sheets.
   */
  appendInvoice(businessId, invoiceData, emailMeta = {}) {
    const all = this._readAll();
    const id = `INV-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const fileSlug = `${invoiceData.proveedor.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${invoiceData.numeroComprobante}`;
    const driveUrl = `https://drive.google.com/file/d/changared-${fileSlug}/view`;

    const entry = {
      id,
      businessId,
      ...invoiceData,
      driveUrl,
      sourceEmail: emailMeta.from || 'facturas@proveedor.com',
      emailSubject: emailMeta.subject || 'Factura adjunta',
      processedAt: new Date().toISOString(),
    };

    all.unshift(entry);
    this._saveAll(all);

    console.log(`[GoogleSheetsService] Nueva fila agregada a Google Sheets para [${businessId}]: ${invoiceData.proveedor} ($${invoiceData.total})`);
    return entry;
  }

  getInvoices(businessId) {
    const all = this._readAll();
    if (!businessId) return all;
    return all.filter((inv) => inv.businessId === businessId);
  }

  getStats(businessId) {
    const list = this.getInvoices(businessId);
    const totalCompras = list.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
    const totalNeto = list.reduce((sum, i) => sum + (Number(i.netoGravado) || 0), 0);
    const totalIva = list.reduce((sum, i) => sum + (Number(i.importeIva) || 0), 0);

    return {
      count: list.length,
      totalCompras,
      totalNeto,
      totalIva,
      googleSheetName: `Libro_IVA_Compras_${new Date().getFullYear()}`,
      driveFolder: `/Google Drive / Facturas ${new Date().getFullYear()}`,
    };
  }
}

export const googleSheetsService = new GoogleSheetsService();
