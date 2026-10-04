import { authService } from '../services/auth.service.js';

export const register = (req, res, next) => {
  try {
    const result = authService.register(req.body);
    res.status(201).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

export const verifyEmail = (req, res, next) => {
  try {
    const result = authService.verifyEmail(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const login = (req, res, next) => {
  try {
    const result = authService.login(req.body);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
};

export const me = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'No hay una sesión activa.',
      });
    }

    const businesses = authService.getBusinessesForUser(req.user.id);

    res.status(200).json({
      success: true,
      user: req.user,
      businesses,
    });
  } catch (err) {
    next(err);
  }
};

export const logout = (req, res, next) => {
  try {
    const result = authService.logout(req.token);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
