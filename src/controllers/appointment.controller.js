import { appointmentRepository } from '../repositories/appointment.repository.js';
import { businessService } from '../services/business.service.js';
import crypto from 'crypto';

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

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

  async create(req, res) {
    try {
      const { businessId } = req.params;
      const { clientName, clientPhone, clientEmail, service, professional, date, time, depositAmount } = req.body;

      if (typeof clientName !== 'string' || !clientName.trim() || clientName.trim().length > 100 ||
          typeof clientPhone !== 'string' || !clientPhone.trim() || clientPhone.trim().length > 30 ||
          typeof service !== 'string' || !service.trim() || service.trim().length > 120) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'clientName, clientPhone y service son requeridos.',
        });
      }

      if (date && !isValidIsoDate(String(date))) {
        return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'La fecha del turno no es válida.' });
      }
      if (time && !/^\d{2}:\d{2}(?:\s*hs)?$/.test(String(time))) {
        return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'El horario del turno no es válido.' });
      }

      const business = await businessService.getBusinessById(businessId);
      if (!business) {
        return res.status(404).json({
          success: false,
          error: 'BUSINESS_NOT_FOUND',
          message: 'El negocio solicitado no existe.',
        });
      }

      const id = `apt-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      const newApt = appointmentRepository.save({
        id,
        businessId: String(businessId).toLowerCase().trim(),
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        clientEmail: typeof clientEmail === 'string' ? clientEmail.trim().slice(0, 150) : '',
        service: service.trim(),
        professional: typeof professional === 'string' && professional.trim() ? professional.trim().slice(0, 120) : 'General',
        date: date || new Date().toISOString().split('T')[0],
        time: time || '12:00 hs',
        status: 'PENDIENTE_CONFIRMACION',
        depositPaid: false,
        depositAmount: depositAmount ? Number(depositAmount) : 5000,
        calendarEventId: '',
        reminderSent: false,
      });

      return res.status(201).json({
        success: true,
        message: 'Solicitud de turno registrada. El negocio debe confirmarla antes de considerarla agendada.',
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
      const { id, businessId } = req.params;
      const { status } = req.body;

      const allowedStatuses = ['PENDIENTE_CONFIRMACION', 'CONFIRMADO', 'PENDIENTE_SENIA', 'CANCELADO', 'COMPLETADO'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'El estado de turno indicado no es válido.',
        });
      }

      const current = appointmentRepository.findById(id);
      if (!current || String(current.businessId).toLowerCase().trim() !== String(businessId).toLowerCase().trim()) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Turno no encontrado.',
        });
      }

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
