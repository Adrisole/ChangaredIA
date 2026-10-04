import fs from 'fs';
import path from 'path';
import { isDbConnected } from '../config/database.js';
import { UserModel } from '../models/user.model.js';
import { SessionModel } from '../models/session.model.js';

/**
 * Repositorio de Usuarios y Sesiones con persistencia híbrida:
 * - MongoDB como FUENTE PRINCIPAL DE VERDAD cuando isDbConnected() es true.
 * - JSON en disco (src/data/users.json y sessions.json) como RÉPLICA LOCAL Y FALLBACK para desarrollo local y offline.
 */
class UserRepository {
  constructor() {
    this.filePath = path.resolve('./src/data/users.json');
    this.sessionsFilePath = path.resolve('./src/data/sessions.json');
    this._ensureFilesExist();
  }

  _ensureFilesExist() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({}, null, 2), 'utf-8');
    }
    if (!fs.existsSync(this.sessionsFilePath)) {
      fs.writeFileSync(this.sessionsFilePath, JSON.stringify({}, null, 2), 'utf-8');
    }
  }

  _readUsersLocal() {
    try {
      this._ensureFilesExist();
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw || '{}');
    } catch (err) {
      console.error('[UserRepository] Error al leer usuarios locales:', err.message);
      return {};
    }
  }

  _writeUsersLocal(data) {
    try {
      this._ensureFilesExist();
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[UserRepository] Error al escribir usuarios locales:', err.message);
      throw new Error('No se pudo guardar la información del usuario.');
    }
  }

  _syncLocalUser(user) {
    if (!user || !user.id) return;
    const users = this._readUsersLocal();
    users[user.id] = user;
    this._writeUsersLocal(users);
  }

  _readSessionsLocal() {
    try {
      this._ensureFilesExist();
      const raw = fs.readFileSync(this.sessionsFilePath, 'utf-8');
      return JSON.parse(raw || '{}');
    } catch (err) {
      return {};
    }
  }

  _writeSessionsLocal(data) {
    try {
      this._ensureFilesExist();
      fs.writeFileSync(this.sessionsFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[UserRepository] Error al escribir sesiones locales:', err.message);
    }
  }

  async findById(id) {
    if (!id) return null;

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const doc = await UserModel.findOne({ id }).lean();
        if (doc) {
          this._syncLocalUser(doc);
          return doc;
        }
      } catch (err) {
        console.error('[UserRepository] Error al consultar usuario en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const users = this._readUsersLocal();
    return users[id] || null;
  }

  async findByEmail(email) {
    if (!email) return null;
    const normalized = String(email).toLowerCase().trim();

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const doc = await UserModel.findOne({ email: normalized }).lean();
        if (doc) {
          this._syncLocalUser(doc);
          return doc;
        }
      } catch (err) {
        console.error('[UserRepository] Error al consultar usuario por email en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const users = this._readUsersLocal();
    return Object.values(users).find(u => u.email.toLowerCase() === normalized) || null;
  }

  async save(user) {
    const key = user.id;
    const record = {
      ...user,
      updatedAt: new Date().toISOString(),
    };

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const savedDoc = await UserModel.findOneAndUpdate(
          { id: user.id },
          record,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();

        this._syncLocalUser(savedDoc || record);
        return savedDoc || record;
      } catch (err) {
        console.error('[UserRepository] Error al guardar usuario en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const users = this._readUsersLocal();
    users[key] = record;
    this._writeUsersLocal(users);
    return record;
  }

  async saveSession(token, userId) {
    const sessionRecord = {
      token,
      userId,
      createdAt: new Date().toISOString(),
    };

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        await SessionModel.findOneAndUpdate(
          { token },
          sessionRecord,
          { upsert: true, new: true }
        ).lean();
      } catch (err) {
        console.error('[UserRepository] Error al sincronizar sesión en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const sessions = this._readSessionsLocal();
    sessions[token] = sessionRecord;
    this._writeSessionsLocal(sessions);
  }

  async findByToken(token) {
    if (!token) return null;

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const sessionDoc = await SessionModel.findOne({ token }).lean();
        if (sessionDoc && sessionDoc.userId) {
          return await this.findById(sessionDoc.userId);
        }
      } catch (err) {
        console.error('[UserRepository] Error al buscar sesión en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const sessions = this._readSessionsLocal();
    const session = sessions[token];
    if (!session) return null;
    return await this.findById(session.userId);
  }

  async removeSession(token) {
    if (!token) return;

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        await SessionModel.deleteOne({ token });
      } catch (err) {
        console.error('[UserRepository] Error al eliminar sesión en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const sessions = this._readSessionsLocal();
    delete sessions[token];
    this._writeSessionsLocal(sessions);
  }

  async findAll() {
    if (isDbConnected()) {
      try {
        const docs = await UserModel.find().lean();
        if (docs && docs.length > 0) return docs;
      } catch (err) {
        console.error('[UserRepository] Error al listar usuarios en MongoDB:', err.message);
      }
    }
    return Object.values(this._readUsersLocal());
  }
}

export const userRepository = new UserRepository();
