import fs from 'fs';
import path from 'path';
import { isDbConnected } from '../config/database.js';
import { InvoiceModel } from '../models/invoice.model.js';

/**
 * Persistencia de comprobantes. MongoDB es la fuente de verdad cuando está
 * conectado; el JSON se conserva para desarrollo local y recuperación offline.
 */
class InvoiceRepository {
  constructor() {
    this.filePath = path.resolve('./src/data/invoices.json');
    this._ensureFile();
  }

  _ensureFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, '[]', 'utf-8');
  }

  _readLocal() {
    try {
      this._ensureFile();
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8') || '[]');
    } catch (error) {
      console.error('[InvoiceRepository] No se pudo leer el respaldo local:', error.message);
      return [];
    }
  }

  _writeLocal(records) {
    try {
      this._ensureFile();
      fs.writeFileSync(this.filePath, JSON.stringify(records, null, 2), 'utf-8');
    } catch (error) {
      console.error('[InvoiceRepository] No se pudo escribir el respaldo local:', error.message);
    }
  }

  _syncLocal(record) {
    if (!record?.id) return;
    const records = this._readLocal();
    const index = records.findIndex(item => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    this._writeLocal(records);
  }

  async findByBusinessId(businessId, { status } = {}) {
    const normalizedId = String(businessId || '').toLowerCase().trim();
    if (isDbConnected()) {
      try {
        const query = { businessId: normalizedId };
        if (status) query.status = status;
        const records = await InvoiceModel.find(query).sort({ fecha: -1, createdAt: -1 }).lean();
        return records;
      } catch (error) {
        console.error('[InvoiceRepository] Falló la lectura desde MongoDB:', error.message);
      }
    }

    return this._readLocal()
      .filter(item => String(item.businessId || '').toLowerCase().trim() === normalizedId)
      .filter(item => !status || item.status === status);
  }

  async save(invoice) {
    const record = {
      ...invoice,
      businessId: String(invoice.businessId || '').toLowerCase().trim(),
      createdAt: invoice.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (isDbConnected()) {
      try {
        const saved = await InvoiceModel.findOneAndUpdate(
          { id: record.id },
          record,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
        this._syncLocal(saved || record);
        return saved || record;
      } catch (error) {
        console.error('[InvoiceRepository] Falló el guardado en MongoDB:', error.message);
      }
    }

    this._syncLocal(record);
    return record;
  }

  async findById(businessId, invoiceId) {
    const normalizedId = String(businessId || '').toLowerCase().trim();
    if (isDbConnected()) {
      try {
        const record = await InvoiceModel.findOne({ id: invoiceId, businessId: normalizedId }).lean();
        if (record) this._syncLocal(record);
        return record;
      } catch (error) {
        console.error('[InvoiceRepository] Falló la búsqueda en MongoDB:', error.message);
      }
    }
    return this._readLocal().find(item => item.id === invoiceId && item.businessId === normalizedId) || null;
  }

  async deleteById(businessId, invoiceId) {
    const record = await this.findById(businessId, invoiceId);
    if (!record) return null;

    if (isDbConnected()) {
      try {
        await InvoiceModel.deleteOne({ id: invoiceId, businessId: record.businessId });
      } catch (error) {
        console.error('[InvoiceRepository] Falló la eliminación en MongoDB:', error.message);
        return null;
      }
    }

    this._writeLocal(this._readLocal().filter(item => item.id !== invoiceId));
    return record;
  }

  async clear(businessId, { onlyDemo = false } = {}) {
    const records = await this.findByBusinessId(businessId);
    const targets = onlyDemo ? records.filter(item => item.isDemo) : records;
    if (!targets.length) return { deletedCount: 0 };

    if (isDbConnected()) {
      try {
        const query = { businessId: String(businessId).toLowerCase().trim() };
        if (onlyDemo) query.isDemo = true;
        await InvoiceModel.deleteMany(query);
      } catch (error) {
        console.error('[InvoiceRepository] Falló la limpieza en MongoDB:', error.message);
        return { deletedCount: 0 };
      }
    }

    const ids = new Set(targets.map(item => item.id));
    this._writeLocal(this._readLocal().filter(item => !ids.has(item.id)));
    return { deletedCount: targets.length };
  }
}

export const invoiceRepository = new InvoiceRepository();
