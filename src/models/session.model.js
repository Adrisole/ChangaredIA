import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  createdAt: { type: String },
}, { timestamps: true });

export const SessionModel = mongoose.models.Session || mongoose.model('Session', sessionSchema);
