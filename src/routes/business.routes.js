import { Router } from 'express';
import { setupBusiness, getBusiness, listBusinesses, listMyBusinesses } from '../controllers/business.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Onboarding de nuevo negocio (asocia al usuario si está autenticado)
router.post('/setup', authenticate, setupBusiness);

// Consultar los negocios privados del usuario autenticado
router.get('/my', authenticate, requireAuth, listMyBusinesses);

// Consultar todos los negocios registrados
router.get('/', listBusinesses);

// Consultar un negocio por su ID
router.get('/:businessId', getBusiness);

export default router;
