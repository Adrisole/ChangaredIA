import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { isDbConnected } from '../config/database.js';
import { BusinessModel } from '../models/business.model.js';

/**
 * Repositorio Multi-Tenant con persistencia híbrida:
 * - MongoDB como FUENTE PRINCIPAL DE VERDAD cuando isDbConnected() es true.
 * - JSON en disco (src/data/businesses.json) como RÉPLICA LOCAL Y FALLBACK para desarrollo local y offline.
 */
class BusinessRepository {
  constructor() {
    this.filePath = config.storage.filePath;
    this._ensureFileExists();
  }

  _ensureFileExists() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({}, null, 2), 'utf-8');
    }
  }

  _readAllLocal() {
    try {
      this._ensureFileExists();
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw || '{}');
    } catch (err) {
      console.error('[BusinessRepository] Error al leer base de datos JSON local:', err.message);
      return {};
    }
  }

  _writeAllLocal(data) {
    try {
      this._ensureFileExists();
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[BusinessRepository] Error al escribir en base de datos JSON local:', err.message);
      throw new Error('No se pudo guardar la información del negocio en el almacenamiento local persistente.');
    }
  }

  _syncLocalRecord(record) {
    if (!record || !record.id) return;
    const all = this._readAllLocal();
    all[String(record.id).toLowerCase().trim()] = record;
    this._writeAllLocal(all);
  }

  /**
   * Busca un negocio por su identificador.
   * Consulta primero MongoDB si está conectado; de lo contrario usa JSON local.
   */
  async findById(businessId) {
    if (!businessId) return null;
    const normalizedKey = String(businessId).toLowerCase().trim();

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const doc = await BusinessModel.findOne({ id: normalizedKey }).lean();
        if (doc) {
          this._syncLocalRecord(doc);
          return doc;
        }
      } catch (err) {
        console.error('[BusinessRepository] Error al consultar negocio en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const all = this._readAllLocal();
    return all[normalizedKey] || null;
  }

  /**
   * Lista todos los negocios registrados.
   * Consulta primero MongoDB si está conectado; de lo contrario usa JSON local.
   */
  async findAll() {
    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const docs = await BusinessModel.find().lean();
        if (docs && docs.length > 0) {
          return docs;
        }
      } catch (err) {
        console.error('[BusinessRepository] Error al listar negocios en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const all = this._readAllLocal();
    return Object.values(all);
  }

  /**
   * Busca los negocios pertenecientes a un usuario propietario.
   */
  async findByOwnerId(ownerId) {
    if (!ownerId) return [];

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const docs = await BusinessModel.find({ ownerId }).lean();
        return docs || [];
      } catch (err) {
        console.error('[BusinessRepository] Error al buscar negocios por ownerId en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const all = this._readAllLocal();
    return Object.values(all).filter(b => b.ownerId === ownerId);
  }

  /**
   * Busca un negocio por su Phone Number ID de Meta Cloud API.
   */
  async findByPhoneNumberId(phoneNumberId) {
    if (!phoneNumberId) return null;
    const cleanId = String(phoneNumberId).trim();

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const doc = await BusinessModel.findOne({ whatsappPhoneNumberId: cleanId }).lean();
        if (doc) {
          this._syncLocalRecord(doc);
          return doc;
        }
      } catch (err) {
        console.error('[BusinessRepository] Error al buscar negocio por phoneNumberId en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const all = this._readAllLocal();
    return Object.values(all).find(b => String(b.whatsappPhoneNumberId || '').trim() === cleanId) || null;
  }

  /**
   * Guarda o actualiza un negocio.
   * Escribe PRIMERO en MongoDB si está conectado, y luego sincroniza la réplica local JSON.
   */
  async save(business) {
    const key = String(business.id).toLowerCase().trim();
    const record = {
      ...business,
      id: key,
      updatedAt: new Date().toISOString(),
    };

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const savedDoc = await BusinessModel.findOneAndUpdate(
          { id: key },
          record,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();

        // Sincronizar en réplica local
        this._syncLocalRecord(savedDoc || record);
        return savedDoc || record;
      } catch (err) {
        console.error('[BusinessRepository] Error al guardar negocio en MongoDB:', err.message);
        throw new Error('MongoDB no pudo guardar el negocio. Los cambios no fueron confirmados.');
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const all = this._readAllLocal();
    all[key] = record;
    this._writeAllLocal(all);
    return record;
  }

  async appendCatalog(businessId, products) {
    const key = String(businessId).toLowerCase().trim();
    const ids = products.map(p => p.id);
    if (new Set(ids).size !== ids.length) throw new Error('La importación contiene identificadores repetidos.');
    if (isDbConnected()) {
      const saved = await BusinessModel.findOneAndUpdate(
        { id: key, 'catalog.id': { $nin: ids } },
        { $push: { catalog: { $each: products } } },
        { returnDocument: 'after' }
      ).lean();
      if (!saved) throw new Error('Algún producto ya existe o el negocio cambió. Recargá antes de importar.');
      this._syncLocalRecord(saved);
      return saved;
    }
    const all = this._readAllLocal();
    const business = all[key];
    if (!business) throw new Error('Negocio inexistente.');
    if ((business.catalog || []).some(p => ids.includes(p.id))) throw new Error('Algún producto ya existe.');
    const saved = { ...business, catalog: [...(business.catalog || []), ...products], updatedAt: new Date().toISOString() };
    all[key] = saved;
    this._writeAllLocal(all);
    return saved;
  }
}

export const businessRepository = new BusinessRepository();
