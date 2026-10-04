import fs from 'fs';
import path from 'path';
import { isDbConnected } from '../config/database.js';
import { AppointmentModel } from '../models/appointment.model.js';

class AppointmentRepository {
  constructor() {
    this.filePath = path.resolve('./src/data/appointments.json');
    this._ensureFileExists();
  }

  _ensureFileExists() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  _readAll() {
    try {
      this._ensureFileExists();
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw || '[]');
    } catch (err) {
      console.error('[AppointmentRepository] Error al leer turnos JSON:', err.message);
      return [];
    }
  }

  _writeAll(data) {
    try {
      this._ensureFileExists();
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AppointmentRepository] Error al escribir turnos JSON:', err.message);
    }
  }

  findByBusinessId(businessId) {
    const all = this._readAll();
    const normalized = String(businessId).toLowerCase().trim();
    return all.filter(a => String(a.businessId).toLowerCase().trim() === normalized);
  }

  findById(id) {
    const all = this._readAll();
    return all.find(a => a.id === id) || null;
  }

  save(appointment) {
    const all = this._readAll();
    const existingIndex = all.findIndex(a => a.id === appointment.id);

    const record = {
      ...appointment,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      all[existingIndex] = record;
    } else {
      record.createdAt = record.createdAt || new Date().toISOString();
      all.unshift(record);
    }

    this._writeAll(all);

    // Si MongoDB está conectado, sincronizar en la base de datos cloud
    if (isDbConnected()) {
      AppointmentModel.findOneAndUpdate(
        { id: record.id },
        record,
        { upsert: true, new: true }
      ).catch(err => {
        console.error('[AppointmentRepository] Error al sincronizar turno en MongoDB:', err.message);
      });
    }

    return record;
  }

  updateStatus(id, status) {
    const all = this._readAll();
    const item = all.find(a => a.id === id);
    if (!item) return null;
    item.status = status;
    item.updatedAt = new Date().toISOString();
    this._writeAll(all);

    if (isDbConnected()) {
      AppointmentModel.findOneAndUpdate(
        { id },
        { status, updatedAt: item.updatedAt },
        { new: true }
      ).catch(err => {
        console.error('[AppointmentRepository] Error al actualizar estado de turno en MongoDB:', err.message);
      });
    }

    return item;
  }
}

export const appointmentRepository = new AppointmentRepository();
