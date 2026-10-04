import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  id: { type: String, required: true },
  sender: { type: String, enum: ['customer', 'ai', 'human'], required: true },
  text: { type: String, required: true },
  timestamp: { type: String, required: true },
  metaMessageId: { type: String, default: '' },
  simulated: { type: Boolean, default: false },
  status: { type: String, default: 'sent' },
  deliveryStatus: { type: String, default: 'sent' },
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  businessId: { type: String, required: true, index: true },
  customerPhone: { type: String, required: true, index: true },
  customerName: { type: String, default: '' },
  status: {
    type: String,
    enum: ['ai_active', 'human_takeover'],
    default: 'ai_active',
  },
  lastMessageText: { type: String, default: '' },
  lastMessageAt: { type: String },
  unreadCount: { type: Number, default: 0 },
  messages: [messageSchema],
  createdAt: { type: String },
  updatedAt: { type: String },
}, { timestamps: true });

export const ConversationModel = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
