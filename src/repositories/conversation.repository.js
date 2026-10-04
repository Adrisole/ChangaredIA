import fs from 'fs';
import path from 'path';
import { isDbConnected } from '../config/database.js';
import { ConversationModel } from '../models/conversation.model.js';

class ConversationRepository {
  constructor() {
    this.filePath = path.resolve('./src/data/conversations.json');
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
      console.error('[ConversationRepository] Error al leer conversaciones JSON:', err.message);
      return [];
    }
  }

  _writeAll(data) {
    try {
      this._ensureFileExists();
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ConversationRepository] Error al escribir conversaciones JSON:', err.message);
    }
  }

  _normalizePhone(phone) {
    return String(phone || '').replace(/[^\d]/g, '');
  }

  _buildId(businessId, customerPhone) {
    const bId = String(businessId || '').toLowerCase().trim();
    const phone = this._normalizePhone(customerPhone) || String(customerPhone).trim();
    return `${bId}_${phone}`;
  }

  findByBusinessId(businessId) {
    const all = this._readAll();
    const normalizedBId = String(businessId).toLowerCase().trim();
    return all
      .filter(c => String(c.businessId).toLowerCase().trim() === normalizedBId)
      .sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
  }

  findById(id) {
    const all = this._readAll();
    return all.find(c => c.id === id) || null;
  }

  findByCustomer(businessId, customerPhone) {
    const id = this._buildId(businessId, customerPhone);
    return this.findById(id);
  }

  getOrCreate(businessId, customerPhone, customerName = '') {
    const id = this._buildId(businessId, customerPhone);
    const existing = this.findById(id);
    if (existing) {
      if (customerName && (!existing.customerName || existing.customerName === existing.customerPhone)) {
        existing.customerName = customerName;
        this.save(existing);
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

    return this.save(newConv);
  }

  save(conversation) {
    const all = this._readAll();
    const existingIndex = all.findIndex(c => c.id === conversation.id);

    const record = {
      ...conversation,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      all[existingIndex] = record;
    } else {
      record.createdAt = record.createdAt || new Date().toISOString();
      all.unshift(record);
    }

    this._writeAll(all);

    // Sincronizar en MongoDB si está activo
    if (isDbConnected()) {
      ConversationModel.findOneAndUpdate(
        { id: record.id },
        record,
        { upsert: true, new: true }
      ).catch(err => {
        console.error('[ConversationRepository] Error al sincronizar conversación en MongoDB:', err.message);
      });
    }

    return record;
  }

  addMessage({ businessId, customerPhone, customerName = '', sender, text, metaMessageId = '', simulated = false }) {
    const conv = this.getOrCreate(businessId, customerPhone, customerName);

    const messageObj = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender, // 'customer' | 'ai' | 'human'
      text: String(text).trim(),
      timestamp: new Date().toISOString(),
      metaMessageId: metaMessageId || '',
      simulated: Boolean(simulated),
      status: sender === 'customer' ? 'received' : 'sent',
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

    return this.save(conv);
  }

  setStatus(businessId, customerPhone, status) {
    const conv = this.getOrCreate(businessId, customerPhone);
    conv.status = status; // 'ai_active' | 'human_takeover'
    return this.save(conv);
  }

  markAsRead(businessId, customerPhone) {
    const conv = this.findByCustomer(businessId, customerPhone);
    if (!conv) return null;
    conv.unreadCount = 0;
    return this.save(conv);
  }
}

export const conversationRepository = new ConversationRepository();
