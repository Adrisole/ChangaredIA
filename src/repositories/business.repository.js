import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { isDbConnected } from '../config/database.js';
import { BusinessModel } from '../models/business.model.js';

/**
 * Repositorio Multi-Tenant ligero para almacenamiento y consulta de negocios en JSON.
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

  _readAll() {
    try {
      this._ensureFileExists();
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw || '{}');
    } catch (err) {
      console.error('[BusinessRepository] Error al leer base de datos JSON:', err.message);
      return {};
    }
  }

  _writeAll(data) {
    try {
      this._ensureFileExists();
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[BusinessRepository] Error al escribir en base de datos JSON:', err.message);
      throw new Error('No se pudo guardar la información del negocio en el almacenamiento persistente.');
    }
  }

  findById(businessId) {
    const all = this._readAll();
    const normalizedKey = String(businessId).toLowerCase().trim();
    return all[normalizedKey] || null;
  }

  findAll() {
    const all = this._readAll();
    return Object.values(all);
  }

  save(business) {
    const all = this._readAll();
    const key = String(business.id).toLowerCase().trim();
    
    all[key] = {
      ...business,
      updatedAt: new Date().toISOString(),
    };

    this._writeAll(all);

    // Si MongoDB está conectado, sincronizar en la nube
    if (isDbConnected()) {
      BusinessModel.findOneAndUpdate(
        { id: key },
        all[key],
        { upsert: true, new: true }
      ).catch(err => {
        console.error('[BusinessRepository] Error al sincronizar negocio en MongoDB:', err.message);
      });
    }

    return all[key];
  }
}

export const businessRepository = new BusinessRepository();
