import { authService } from '../services/auth.service.js';
import { businessService } from '../services/business.service.js';

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

/**
 * Middleware para validar que el usuario autenticado sea el dueño legítimo del negocio.
 * Garantiza aislamiento y propiedad en chats, bandeja inbox, control humano y configuración.
 */
export const requireBusinessOwner = (req, res, next) => {
  const businessId = req.params.businessId;
  if (!businessId) {
    return res.status(400).json({
      success: false,
      error: 'BAD_REQUEST',
      message: 'El identificador del negocio es obligatorio.',
    });
  }

  const business = businessService.getBusinessById(businessId);
  if (!business) {
    return res.status(404).json({
      success: false,
      error: 'BUSINESS_NOT_FOUND',
      message: `El negocio '${businessId}' no existe en la plataforma.`,
    });
  }

  // Si el negocio tiene propietario registrado en el sistema multi-tenant:
  if (business.ownerId) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Debes iniciar sesión con la cuenta propietaria para acceder a los chats o configurar este negocio.',
      });
    }

    if (req.user.id !== business.ownerId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Acceso denegado: No eres el propietario registrado de este negocio.',
      });
    }
  }

  req.business = business;
  next();
};
