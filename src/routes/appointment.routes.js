import { Router } from 'express';
import { appointmentController } from '../controllers/appointment.controller.js';
import { authenticate, requireBusinessOwner } from '../middlewares/auth.middleware.js';

const router = Router();

// Los datos de clientes y sus turnos sólo los consulta la cuenta propietaria.
router.get('/:businessId', authenticate, requireBusinessOwner, appointmentController.getByBusiness.bind(appointmentController));
router.post('/:businessId', appointmentController.create.bind(appointmentController));
router.patch('/:businessId/:id/status', authenticate, requireBusinessOwner, appointmentController.updateStatus.bind(appointmentController));

export default router;
