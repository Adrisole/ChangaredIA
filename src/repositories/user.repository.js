import fs from 'fs';
import path from 'path';
import { isDbConnected } from '../config/database.js';
import { UserModel } from '../models/user.model.js';
import { SessionModel } from '../models/session.model.js';

/**
 * Repositorio ligero de Usuarios y Sesiones con persistencia en JSON.
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

  _readUsers() {
    try {
      this._ensureFilesExist();
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw || '{}');
    } catch (err) {
      console.error('[UserRepository] Error al leer usuarios:', err.message);
      return {};
    }
  }

  _writeUsers(data) {
    try {
      this._ensureFilesExist();
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[UserRepository] Error al escribir usuarios:', err.message);
      throw new Error('No se pudo guardar la información del usuario.');
    }
  }

  _readSessions() {
    try {
      this._ensureFilesExist();
      const raw = fs.readFileSync(this.sessionsFilePath, 'utf-8');
      return JSON.parse(raw || '{}');
    } catch (err) {
      return {};
    }
  }

  _writeSessions(data) {
    try {
      this._ensureFilesExist();
      fs.writeFileSync(this.sessionsFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[UserRepository] Error al escribir sesiones:', err.message);
    }
  }

  findById(id) {
    const users = this._readUsers();
    return users[id] || null;
  }

  findByEmail(email) {
    if (!email) return null;
    const normalized = String(email).toLowerCase().trim();
    const users = this._readUsers();
    return Object.values(users).find(u => u.email.toLowerCase() === normalized) || null;
  }

  save(user) {
    const users = this._readUsers();
    const key = user.id;
    users[key] = {
      ...user,
      updatedAt: new Date().toISOString(),
    };
    this._writeUsers(users);

    if (isDbConnected()) {
      UserModel.findOneAndUpdate(
        { id: user.id },
        users[key],
        { upsert: true, new: true }
      ).catch(err => {
        console.error('[UserRepository] Error al sincronizar usuario en MongoDB:', err.message);
      });
    }

    return users[key];
  }

  saveSession(token, userId) {
    const sessions = this._readSessions();
    sessions[token] = {
      userId,
      createdAt: new Date().toISOString(),
    };
    this._writeSessions(sessions);

    if (isDbConnected()) {
      SessionModel.findOneAndUpdate(
        { token },
        { token, userId, createdAt: sessions[token].createdAt },
        { upsert: true, new: true }
      ).catch(err => {
        console.error('[UserRepository] Error al sincronizar sesión en MongoDB:', err.message);
      });
    }
  }

  findByToken(token) {
    if (!token) return null;
    const sessions = this._readSessions();
    const session = sessions[token];
    if (!session) return null;
    return this.findById(session.userId);
  }

  removeSession(token) {
    if (!token) return;
    const sessions = this._readSessions();
    delete sessions[token];
    this._writeSessions(sessions);

    if (isDbConnected()) {
      SessionModel.deleteOne({ token }).catch(err => {
        console.error('[UserRepository] Error al eliminar sesión en MongoDB:', err.message);
      });
    }
  }

  findAll() {
    return Object.values(this._readUsers());
  }
}

export const userRepository = new UserRepository();
