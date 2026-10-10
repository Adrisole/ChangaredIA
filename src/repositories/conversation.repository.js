import fs from 'fs';
import path from 'path';
import { isDbConnected } from '../config/database.js';
import { ConversationModel } from '../models/conversation.model.js';

/**
 * Repositorio de Conversaciones y Mensajes con persistencia híbrida:
 * - MongoDB como FUENTE PRINCIPAL DE VERDAD cuando isDbConnected() es true.
 * - JSON en disco (src/data/conversations.json) como RÉPLICA LOCAL Y FALLBACK para desarrollo local y offline.
 */
class ConversationRepository {
  constructor() {
    this.filePath = path.resolve('./src/data/conversations.json');
    this._ensureFileExists();
    this._processedSet = new Set();
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

  _readAllLocal() {
    try {
      this._ensureFileExists();
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw || '[]');
    } catch (err) {
      console.error('[ConversationRepository] Error al leer conversaciones JSON locales:', err.message);
      return [];
    }
  }

  _writeAllLocal(data) {
    try {
      this._ensureFileExists();
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ConversationRepository] Error al escribir conversaciones JSON locales:', err.message);
    }
  }

  _syncLocalRecord(record) {
    if (!record || !record.id) return;
    const all = this._readAllLocal();
    const existingIndex = all.findIndex(c => c.id === record.id);
    if (existingIndex >= 0) {
      all[existingIndex] = record;
    } else {
      all.unshift(record);
    }
    this._writeAllLocal(all);
  }

  _normalizePhone(phone) {
    return String(phone || '').replace(/[^\d]/g, '');
  }

  _buildId(businessId, customerPhone) {
    const bId = String(businessId || '').toLowerCase().trim();
    const phone = this._normalizePhone(customerPhone) || String(customerPhone).trim();
    return `${bId}_${phone}`;
  }

  /**
   * Lista las conversaciones de un negocio ordenadas por actividad reciente.
   */
  async findByBusinessId(businessId) {
    const normalizedBId = String(businessId || '').toLowerCase().trim();

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const docs = await ConversationModel.find({ businessId: normalizedBId })
          .sort({ lastMessageAt: -1 })
          .lean();
        if (docs && docs.length > 0) {
          return docs;
        }
      } catch (err) {
        console.error('[ConversationRepository] Error al consultar conversaciones en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const all = this._readAllLocal();
    return all
      .filter(c => String(c.businessId).toLowerCase().trim() === normalizedBId)
      .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
  }

  /**
   * Busca una conversación por su ID único.
   */
  async findById(id) {
    if (!id) return null;

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const doc = await ConversationModel.findOne({ id }).lean();
        if (doc) {
          this._syncLocalRecord(doc);
          return doc;
        }
      } catch (err) {
        console.error('[ConversationRepository] Error al buscar conversación en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const all = this._readAllLocal();
    return all.find(c => c.id === id) || null;
  }

  /**
   * Busca conversación por negocio y teléfono de cliente.
   */
  async findByCustomer(businessId, customerPhone) {
    const id = this._buildId(businessId, customerPhone);
    return await this.findById(id);
  }

  /**
   * Obtiene o inicializa una conversación para el cliente.
   */
  async getOrCreate(businessId, customerPhone, customerName = '') {
    const id = this._buildId(businessId, customerPhone);
    const existing = await this.findById(id);
    if (existing) {
      if (customerName && (!existing.customerName || existing.customerName === existing.customerPhone)) {
        existing.customerName = customerName;
        return await this.save(existing);
      }
      return existing;
    }

    const newConv = {
      id,
      businessId: String(businessId).toLowerCase().trim(),
      customerPhone: this._normalizePhone(customerPhone) || String(customerPhone).trim(),
      customerName: customerName || customerPhone,
      status: 'ai_active', // por defecto la IA atiende automáticamente
      lastMessageText: '',
      lastMessageAt: new Date().toISOString(),
      unreadCount: 0,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return await this.save(newConv);
  }

  /**
   * Guarda o actualiza una conversación.
   * Escribe PRIMERO en MongoDB si está conectado, y sincroniza en JSON local.
   */
  async save(conversation) {
    const record = {
      ...conversation,
      updatedAt: new Date().toISOString(),
      createdAt: conversation.createdAt || new Date().toISOString(),
    };

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const savedDoc = await ConversationModel.findOneAndUpdate(
          { id: record.id },
          record,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();

        this._syncLocalRecord(savedDoc || record);
        return savedDoc || record;
      } catch (err) {
        console.error('[ConversationRepository] Error al guardar conversación en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    this._syncLocalRecord(record);
    return record;
  }

  /**
   * Agrega un nuevo mensaje entrante o saliente.
   */
  async addMessage({ businessId, customerPhone, customerName = '', sender, text, metaMessageId = '', simulated = false }) {
    const conv = await this.getOrCreate(businessId, customerPhone, customerName);

    const messageObj = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender, // 'customer' | 'ai' | 'human'
      text: String(text).trim(),
      timestamp: new Date().toISOString(),
      metaMessageId: metaMessageId || '',
      simulated: Boolean(simulated),
      status: sender === 'customer' ? 'received' : 'sent',
      deliveryStatus: 'sent',
    };

    conv.messages = conv.messages || [];
    conv.messages.push(messageObj);
    conv.lastMessageText = messageObj.text;
    conv.lastMessageAt = messageObj.timestamp;

    if (sender === 'customer' && conv.status === 'human_takeover') {
      conv.unreadCount = (conv.unreadCount || 0) + 1;
    } else if (sender === 'human') {
      conv.unreadCount = 0;
    }

    if (metaMessageId) {
      if (!this._processedSet) this._processedSet = new Set();
      this._processedSet.add(String(metaMessageId).trim());
    }

    return await this.save(conv);
  }

  /**
   * Verifica si un mensaje de Meta (wamid) ya fue procesado previamente para evitar duplicados.
   */
  async hasProcessedMessage(metaMessageId) {
    if (!metaMessageId) return false;
    const cleanId = String(metaMessageId).trim();
    if (this._processedSet && this._processedSet.has(cleanId)) {
      return true;
    }

    // Consultar MongoDB si está activo
    if (isDbConnected()) {
      try {
        const found = await ConversationModel.findOne({ 'messages.metaMessageId': cleanId }).lean();
        if (found) {
          this._processedSet.add(cleanId);
          return true;
        }
      } catch (err) {
        console.error('[ConversationRepository] Error al verificar duplicado en MongoDB:', err.message);
      }
    }

    // Fallback a JSON local
    const all = this._readAllLocal();
    for (const conv of all) {
      if (Array.isArray(conv.messages)) {
        if (conv.messages.some(m => m.metaMessageId === cleanId)) {
          if (!this._processedSet) this._processedSet = new Set();
          this._processedSet.add(cleanId);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Actualiza el estado de entrega reportado por Meta (sent, delivered, read, failed).
   */
  async updateDeliveryStatus(metaMessageId, deliveryStatus, timestamp = null) {
    if (!metaMessageId) return null;
    const cleanId = String(metaMessageId).trim();
    const isoTimestamp = timestamp ? new Date(Number(timestamp) * 1000).toISOString() : new Date().toISOString();

    // 1. FUENTE PRINCIPAL: MongoDB
    if (isDbConnected()) {
      try {
        const conv = await ConversationModel.findOne({ 'messages.metaMessageId': cleanId });
        if (conv) {
          const msg = conv.messages.find(m => m.metaMessageId === cleanId);
          if (msg) {
            msg.deliveryStatus = deliveryStatus;
            msg.statusTimestamp = isoTimestamp;
            await conv.save();
            const leanConv = conv.toObject();
            this._syncLocalRecord(leanConv);
            return leanConv;
          }
        }
      } catch (err) {
        console.error('[ConversationRepository] Error al actualizar deliveryStatus en MongoDB:', err.message);
      }
    }

    // 2. RÉPLICA / FALLBACK: JSON local
    const all = this._readAllLocal();
    let updatedConv = null;

    for (const conv of all) {
      if (Array.isArray(conv.messages)) {
        const msg = conv.messages.find(m => m.metaMessageId === cleanId);
        if (msg) {
          msg.deliveryStatus = deliveryStatus;
          msg.statusTimestamp = isoTimestamp;
          updatedConv = conv;
          break;
        }
      }
    }

    if (updatedConv) {
      return await this.save(updatedConv);
    }
    return null;
  }

  async setStatus(businessId, customerPhone, status) {
    const conv = await this.getOrCreate(businessId, customerPhone);
    conv.status = status; // 'ai_active' | 'human_takeover'
    return await this.save(conv);
  }

  async markAsRead(businessId, customerPhone) {
    const conv = await this.findByCustomer(businessId, customerPhone);
    if (!conv) return null;
    conv.unreadCount = 0;
    return await this.save(conv);
  }

  /** Borra todas las conversaciones de un negocio (MongoDB y JSON). */
  async deleteByBusinessId(businessId) {
    const bId = String(businessId || '').toLowerCase().trim();
    if (!bId) return 0;
    if (isDbConnected()) {
      await ConversationModel.deleteMany({ businessId: bId });
    }
    const all = this._readAllLocal();
    const kept = all.filter(c => String(c.businessId).toLowerCase().trim() !== bId);
    this._writeAllLocal(kept);
    return all.length - kept.length;
  }

  /**
   * Borra las conversaciones sin actividad desde antes de `cutoffIso` (fecha ISO).
   * Se usa la fecha del último mensaje; si falta, la de última actualización.
   */
  async deleteInactiveBefore(cutoffIso) {
    let deleted = 0;
    if (isDbConnected()) {
      const result = await ConversationModel.deleteMany({
        $or: [
          { lastMessageAt: { $lt: cutoffIso } },
          { lastMessageAt: { $in: [null, ''] }, updatedAt: { $lt: cutoffIso } },
          { lastMessageAt: { $in: [null, ''] }, updatedAt: { $lt: new Date(cutoffIso) } },
        ],
      });
      deleted = result.deletedCount || 0;
    }
    const all = this._readAllLocal();
    const kept = all.filter(c => (c.lastMessageAt || c.updatedAt || '') >= cutoffIso);
    if (kept.length !== all.length) this._writeAllLocal(kept);
    return Math.max(deleted, all.length - kept.length);
  }
}

export const conversationRepository = new ConversationRepository();
