import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  businessId: { type: String, required: true, index: true },
  clientName: { type: String, required: true },
  clientPhone: { type: String, required: true },
  clientEmail: { type: String, default: '' },
  service: { type: String, required: true },
  professional: { type: String, default: 'General' },
  date: { type: String, required: true },
  time: { type: String, required: true },
  status: {
    type: String,
    enum: ['PENDIENTE_CONFIRMACION', 'CONFIRMADO', 'PENDIENTE_SENIA', 'CANCELADO', 'COMPLETADO'],
    default: 'PENDIENTE_CONFIRMACION',
  },
  depositPaid: { type: Boolean, default: true },
  depositAmount: { type: Number, default: 5000 },
  calendarEventId: { type: String, default: '' },
  reminderSent: { type: Boolean, default: false },
  createdAt: { type: String },
  updatedAt: { type: String },
}, { timestamps: true });

export const AppointmentModel = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);
