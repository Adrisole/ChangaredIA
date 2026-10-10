import { Router } from 'express';
import { register, login, me, verifyEmail, logout, deleteAccount } from '../controllers/auth.controller.js';
import { authenticate, requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Registro simple: nombre, email, contraseña
router.post('/register', register);

// Verificación de correo electrónico
router.post('/verify-email', verifyEmail);

// Iniciar sesión
router.post('/login', login);

// Obtener datos del usuario y sus negocios privados
router.get('/me', authenticate, requireAuth, me);

// Cerrar sesión
router.post('/logout', authenticate, logout);

// Eliminar la cuenta del comercio y todos sus datos (pide la contraseña)
router.delete('/account', authenticate, requireAuth, deleteAccount);

export default router;
