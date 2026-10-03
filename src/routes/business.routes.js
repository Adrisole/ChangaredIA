import { Router } from 'express';
import { setupBusiness, getBusiness, listBusinesses } from '../controllers/business.controller.js';

const router = Router();

// Onboarding rápido de nuevo negocio
router.post('/setup', setupBusiness);

// Consultar todos los negocios registrados
router.get('/', listBusinesses);

// Consultar un negocio por su ID
router.get('/:businessId', getBusiness);

export default router;
