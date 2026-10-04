import { Router } from 'express';
import { appointmentController } from '../controllers/appointment.controller.js';

const router = Router();

router.get('/:businessId', appointmentController.getByBusiness.bind(appointmentController));
router.post('/:businessId', appointmentController.create.bind(appointmentController));
router.patch('/:id/status', appointmentController.updateStatus.bind(appointmentController));

export default router;
