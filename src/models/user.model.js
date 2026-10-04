import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  salt: { type: String, required: true },
  emailVerified: { type: Boolean, default: false },
  verificationCode: { type: String, default: null },
  businesses: [{ type: String }],
  createdAt: { type: String },
  updatedAt: { type: String },
}, { timestamps: true });

export const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
