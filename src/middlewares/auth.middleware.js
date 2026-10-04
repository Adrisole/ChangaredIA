import { authService } from '../services/auth.service.js';

/**
 * Middleware para extraer y validar el token de autenticación (si se envía).
 */
export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers['x-auth-token'];
  let token = null;

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else {
      token = authHeader.trim();
    }
  }

  if (token) {
    const user = authService.getUserByToken(token);
    if (user) {
      req.user = user;
      req.token = token;
    }
  }

  next();
};

/**
 * Middleware para bloquear rutas que requieren obligatoriamente sesión activa.
 */
export const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Debes iniciar sesión o registrar tu cuenta para realizar esta acción.',
    });
  }
  next();
};
