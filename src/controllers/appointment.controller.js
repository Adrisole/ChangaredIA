import { appointmentRepository } from '../repositories/appointment.repository.js';
import crypto from 'crypto';

export class AppointmentController {
  getByBusiness(req, res) {
    try {
      const { businessId } = req.params;
      const appointments = appointmentRepository.findByBusinessId(businessId);
      return res.status(200).json({
        success: true,
        data: appointments,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }

  create(req, res) {
    try {
      const { businessId } = req.params;
      const { clientName, clientPhone, clientEmail, service, professional, date, time, depositAmount } = req.body;

      if (!clientName || !clientPhone || !service) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'clientName, clientPhone y service son requeridos.',
        });
      }

      const id = `apt-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      const newApt = appointmentRepository.save({
        id,
        businessId: String(businessId).toLowerCase().trim(),
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        clientEmail: clientEmail ? clientEmail.trim() : '',
        service: service.trim(),
        professional: professional || 'General',
        date: date || new Date().toISOString().split('T')[0],
        time: time || '12:00 hs',
        status: 'CONFIRMADO',
        depositPaid: true,
        depositAmount: depositAmount ? Number(depositAmount) : 5000,
        calendarEventId: `cal_evt_${Date.now()}`,
        reminderSent: false,
      });

      return res.status(201).json({
        success: true,
        message: 'Turno agendado exitosamente.',
        data: newApt,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }

  updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const updated = appointmentRepository.updateStatus(id, status);
      if (!updated) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Turno no encontrado.',
        });
      }

      return res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }
}

export const appointmentController = new AppointmentController();
