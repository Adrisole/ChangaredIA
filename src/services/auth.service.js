import crypto from 'crypto';
import { userRepository } from '../repositories/user.repository.js';
import { businessRepository } from '../repositories/business.repository.js';
import { conversationRepository } from '../repositories/conversation.repository.js';
import { appointmentRepository } from '../repositories/appointment.repository.js';
import { invoiceRepository } from '../repositories/invoice.repository.js';

export class AuthService {
  /**
   * Hashea una contraseña usando scrypt nativo con salt seguro.
   */
  _hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }

  /**
   * Filtra campos sensibles del objeto de usuario.
   */
  _sanitize(user) {
    if (!user) return null;
    const { passwordHash, salt, verificationCode, ...safe } = user;
    return safe;
  }

  /**
   * Registra un nuevo usuario en la plataforma.
   */
  async register({ name, email, password }) {
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new Error("El campo 'name' (Nombre) es obligatorio y debe tener al menos 2 caracteres.");
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("El email ingresado no es válido.");
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new Error("La contraseña debe tener al menos 6 caracteres.");
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await userRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new Error(`Ya existe una cuenta registrada con el correo '${normalizedEmail}'.`);
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this._hashPassword(password, salt);
    const userId = `usr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    const verificationCode = String(Math.floor(100000 + Math.random() * 900000));

    const newUser = {
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      salt,
      passwordHash,
      emailVerified: false,
      verificationCode,
      businessIds: [],
      createdAt: new Date().toISOString(),
    };

    await userRepository.save(newUser);

    // Generar token de sesión inmediato
    const token = crypto.randomBytes(32).toString('hex');
    await userRepository.saveSession(token, userId);

    return {
      user: this._sanitize(newUser),
      token,
      verificationCode, // Para mostrar en testing/demo o enviar por email
      message: `¡Cuenta creada con éxito! Se envió un código de verificación a ${normalizedEmail}.`,
    };
  }

  /**
   * Verifica el correo electrónico mediante código de 6 dígitos.
   */
  async verifyEmail({ email, code }) {
    if (!email || !code) {
      throw new Error("Email y código de verificación son requeridos.");
    }

    const user = await userRepository.findByEmail(email.toLowerCase().trim());
    if (!user) {
      throw new Error("Usuario no encontrado.");
    }

    if (user.emailVerified) {
      return { success: true, user: this._sanitize(user), message: "El correo ya estaba verificado." };
    }

    if (!user.verificationCode || user.verificationCode !== String(code).trim()) {
      throw new Error("Código de verificación incorrecto.");
    }

    user.emailVerified = true;
    await userRepository.save(user);

    return {
      success: true,
      user: this._sanitize(user),
      message: "¡Correo electrónico verificado exitosamente!",
    };
  }

  /**
   * Inicia sesión con email y contraseña.
   */
  async login({ email, password }) {
    if (!email || !password) {
      throw new Error("Debes ingresar email y contraseña.");
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await userRepository.findByEmail(normalizedEmail);
    if (!user) {
      throw new Error("Credenciales inválidas. Verifica tu correo y contraseña.");
    }

    const testHash = this._hashPassword(password, user.salt);
    if (testHash !== user.passwordHash) {
      throw new Error("Credenciales inválidas. Verifica tu correo y contraseña.");
    }

    const token = crypto.randomBytes(32).toString('hex');
    await userRepository.saveSession(token, user.id);

    return {
      user: this._sanitize(user),
      token,
      message: `¡Bienvenido de nuevo, ${user.name}!`,
    };
  }

  /**
   * Obtiene el usuario autenticado a partir del token.
   */
  async getUserByToken(token) {
    if (!token) return null;
    const user = await userRepository.findByToken(token);
    return this._sanitize(user);
  }

  /**
   * Cierra sesión eliminando el token.
   */
  async logout(token) {
    if (token) {
      await userRepository.removeSession(token);
    }
    return { success: true, message: "Sesión cerrada correctamente." };
  }

  /**
   * Elimina la cuenta del comercio y todos sus datos: negocios (con pedidos y
   * catálogo), conversaciones, turnos, comprobantes, sesiones y el usuario.
   * Pide la contraseña para confirmar que es el titular.
   */
  async deleteAccount(userId, password) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw Object.assign(new Error('Usuario no encontrado.'), { status: 404 });
    }
    if (!password || this._hashPassword(String(password), user.salt) !== user.passwordHash) {
      throw Object.assign(new Error('La contraseña no es correcta.'), { status: 401 });
    }

    const businessIds = new Set(Array.isArray(user.businessIds) ? user.businessIds : []);
    for (const b of await businessRepository.findByOwnerId(userId)) businessIds.add(b.id);

    for (const businessId of businessIds) {
      const business = await businessRepository.findById(businessId);
      // Nunca borrar un negocio que pertenece a otra cuenta.
      if (business && business.ownerId && business.ownerId !== userId) continue;
      await conversationRepository.deleteByBusinessId(businessId);
      await appointmentRepository.deleteByBusinessId(businessId);
      await invoiceRepository.clear(businessId);
      if ((await invoiceRepository.findByBusinessId(businessId)).length) {
        throw Object.assign(new Error('No se pudieron borrar los comprobantes. Intentá de nuevo.'), { status: 503 });
      }
      await businessRepository.deleteById(businessId);
    }

    await userRepository.deleteUserAndSessions(userId);
    return { success: true, message: 'Tu cuenta y todos sus datos fueron eliminados.' };
  }

  /**
   * Asocia un negocio al usuario autenticado.
   */
  async linkBusiness(userId, businessId) {
    if (!userId || !businessId) return;
    const user = await userRepository.findById(userId);
    if (user) {
      if (!Array.isArray(user.businessIds)) {
        user.businessIds = [];
      }
      if (!user.businessIds.includes(businessId)) {
        user.businessIds.push(businessId);
        await userRepository.save(user);
      }
    }
  }

  /**
   * Retorna todos los negocios asociados a un usuario.
   */
  async getBusinessesForUser(userId) {
    if (!userId) return [];
    const user = await userRepository.findById(userId);
    if (!user || !Array.isArray(user.businessIds)) return [];
    
    const results = [];
    for (const bId of user.businessIds) {
      const b = await businessRepository.findById(bId);
      if (b) results.push(b);
    }
    return results;
  }
}

export const authService = new AuthService();
