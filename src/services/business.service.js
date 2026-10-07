import { businessRepository } from '../repositories/business.repository.js';
import { authService } from './auth.service.js';
import { encryptionService } from './encryption.service.js';

/**
 * Servicio de Negocios y Onboarding Multi-Tenant.
 */
export class BusinessService {
  /**
   * Registra o actualiza la configuración de un negocio en la plataforma.
   * Requiere obligatoriamente un usuario propietario registrado (ownerId).
   */
  async setupBusiness(payload, userId = null) {
    const { id, name, description, toneOfVoice, businessRules, catalog } = payload;

    if (!name || typeof name !== 'string') {
      throw new Error("El campo 'name' (Nombre del negocio) es obligatorio.");
    }

    if (!description || typeof description !== 'string') {
      throw new Error("El campo 'description' es obligatorio para contextualizar al agente virtual.");
    }

    const ownerId = userId || payload.userId || payload.ownerId || null;
    if (!ownerId) {
      throw new Error("Todo negocio debe estar vinculado a una cuenta propietaria registrada (ownerId obligatorio).");
    }

    // Normalizar o generar slug identificador único
    const businessId = id
      ? this._slugify(id)
      : this._slugify(name);

    // Formatear catálogo y productos con validación básica de stock y precio
    const normalizedCatalog = Array.isArray(catalog)
      ? catalog.map((item, index) => ({
          id: item.id || `PROD-${index + 1}`,
          name: item.name || 'Producto sin nombre',
          price: Number(item.price) || 0,
          stock: item.stock !== undefined ? Math.max(0, parseInt(item.stock, 10)) : 0,
          description: item.description || '',
          category: item.category || 'General',
        }))
      : [];

    // Normalizar reglas de negocio
    const normalizedRules = Array.isArray(businessRules)
      ? businessRules
      : typeof businessRules === 'string'
      ? businessRules.split('\n').filter(Boolean)
      : [];

    const existing = await businessRepository.findById(businessId);
    if (existing && existing.ownerId !== ownerId) throw new Error('No podés modificar un negocio de otra cuenta.');

    // Cifrar el token de Meta y el App Secret si se proporcionan en texto plano
    const rawToken = payload.whatsappAccessToken !== undefined
      ? String(payload.whatsappAccessToken).trim()
      : (existing?.whatsappAccessToken || '');

    const encryptedToken = rawToken
      ? (encryptionService.isEncrypted(rawToken) ? rawToken : encryptionService.encrypt(rawToken))
      : '';

    const rawAppSecret = payload.whatsappAppSecret !== undefined
      ? String(payload.whatsappAppSecret).trim()
      : (existing?.whatsappAppSecret || '');

    const encryptedAppSecret = rawAppSecret
      ? (encryptionService.isEncrypted(rawAppSecret) ? rawAppSecret : encryptionService.encrypt(rawAppSecret))
      : '';

    const businessData = {
      ...(existing || {}),
      id: businessId,
      name: name.trim(),
      description: description.trim(),
      rubro: payload.rubro || existing?.rubro || 'General',
      phone: payload.phone !== undefined ? payload.phone : (existing?.phone || ''),
      email: payload.email !== undefined ? payload.email : (existing?.email || ''),
      hours: payload.hours !== undefined ? payload.hours : (existing?.hours || ''),
      website: payload.website !== undefined ? payload.website : (existing?.website || ''),
      deposit: Number(payload.deposit) || existing?.deposit || 5000,
      paymentMethod: payload.paymentMethod !== undefined ? String(payload.paymentMethod).trim() : (existing?.paymentMethod || ''),
      notificationPhone: payload.notificationPhone !== undefined ? String(payload.notificationPhone).trim() : (existing?.notificationPhone || ''),
      toneOfVoice: toneOfVoice || existing?.toneOfVoice || 'amigable, respetuoso y dispuesto a ayudar',
      language: payload.language || existing?.language || 'Español',
      autoDetectLanguage: payload.autoDetectLanguage !== undefined ? Boolean(payload.autoDetectLanguage) : (existing?.autoDetectLanguage ?? true),
      businessRules: normalizedRules.length > 0 ? normalizedRules : (existing?.businessRules || []),
      catalog: Array.isArray(catalog) ? normalizedCatalog : (existing?.catalog || []),
      services: Array.isArray(payload.services) && payload.services.length > 0 ? payload.services : (existing?.services || []),
      activeEmployees: Array.isArray(payload.activeEmployees) && payload.activeEmployees.length > 0 ? payload.activeEmployees : (existing?.activeEmployees || ['vendedor']),
      ownerId: ownerId || existing?.ownerId,
      whatsappConnected: payload.whatsappConnected !== undefined ? Boolean(payload.whatsappConnected) : (existing?.whatsappConnected ?? false),
      whatsappPhoneNumberId: payload.whatsappPhoneNumberId !== undefined ? payload.whatsappPhoneNumberId : (existing?.whatsappPhoneNumberId || ''),
      whatsappAccessToken: encryptedToken,
      whatsappAppSecret: encryptedAppSecret,
      whatsappBusinessAccountId: payload.whatsappBusinessAccountId !== undefined ? payload.whatsappBusinessAccountId : (existing?.whatsappBusinessAccountId || ''),
      calendarConnected: payload.calendarConnected !== undefined ? Boolean(payload.calendarConnected) : (existing?.calendarConnected ?? false),
      calendarEmail: payload.calendarEmail !== undefined ? payload.calendarEmail : (existing?.calendarEmail || ''),
      driveFolder: payload.driveFolder !== undefined ? payload.driveFolder : (existing?.driveFolder || ''),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    const saved = await businessRepository.save(businessData);

    // Si hay un usuario propietario, vincularlo
    if (saved.ownerId) {
      await authService.linkBusiness(saved.ownerId, saved.id);
    }

    return saved;
  }

  async updateWhatsAppConfig(businessId, configData) {
    const business = await businessRepository.findById(businessId);
    if (!business) {
      throw new Error(`El negocio '${businessId}' no existe.`);
    }

    let tokenToSave = business.whatsappAccessToken || '';
    if (configData.whatsappAccessToken !== undefined) {
      const trimmed = String(configData.whatsappAccessToken).trim();
      tokenToSave = trimmed ? encryptionService.encrypt(trimmed) : '';
    }

    let appSecretToSave = business.whatsappAppSecret || '';
    if (configData.whatsappAppSecret !== undefined) {
      const trimmedSecret = String(configData.whatsappAppSecret).trim();
      appSecretToSave = trimmedSecret
        ? (encryptionService.isEncrypted(trimmedSecret) ? trimmedSecret : encryptionService.encrypt(trimmedSecret))
        : '';
    }

    const nextPhoneId = configData.whatsappPhoneNumberId !== undefined
      ? String(configData.whatsappPhoneNumberId).trim()
      : (business.whatsappPhoneNumberId || '');

    // Validación seria para estado oficial Conectado: requiere Phone Number ID y Access Token
    const hasCredentials = Boolean(nextPhoneId && tokenToSave);
    const requestedConnected = configData.whatsappConnected !== undefined
      ? Boolean(configData.whatsappConnected)
      : business.whatsappConnected;

    const isConnected = Boolean(requestedConnected && hasCredentials);

    const updated = {
      ...business,
      phone: configData.phone !== undefined ? String(configData.phone).trim() : business.phone,
      whatsappConnected: isConnected,
      whatsappPhoneNumberId: nextPhoneId,
      whatsappAccessToken: tokenToSave,
      whatsappAppSecret: appSecretToSave,
      whatsappBusinessAccountId: configData.whatsappBusinessAccountId !== undefined ? String(configData.whatsappBusinessAccountId).trim() : (business.whatsappBusinessAccountId || ''),
      updatedAt: new Date().toISOString(),
    };

    return await businessRepository.save(updated);
  }

  async getBusinessById(businessId) {
    return await businessRepository.findById(businessId);
  }

  async getBusinessByPhoneNumberId(phoneNumberId) {
    return await businessRepository.findByPhoneNumberId(phoneNumberId);
  }

  async getBusinessesByOwnerId(ownerId) {
    if (!ownerId) return [];
    return await businessRepository.findByOwnerId(ownerId);
  }

  async getAllBusinesses() {
    return await businessRepository.findAll();
  }

  /**
   * Sanitiza un negocio para respuestas públicas o inspección en la UI,
   * omitiendo el token cifrado de WhatsApp y App Secret y exponiendo únicamente flags seguros y máscara.
   */
  sanitizeBusiness(business) {
    if (!business) return null;
    const clean = { ...business };
    delete clean.orders;
    delete clean.notificationPhone;
    clean.hasAccessToken = Boolean(clean.whatsappAccessToken);
    clean.hasAppSecret = Boolean(clean.whatsappAppSecret);
    clean.tokenEncrypted = encryptionService.isEncrypted(clean.whatsappAccessToken);
    clean.whatsappAccessTokenMasked = clean.whatsappAccessToken
      ? encryptionService.maskToken(clean.whatsappAccessToken)
      : '';
    delete clean.whatsappAccessToken;
    delete clean.whatsappAppSecret;
    return clean;
  }

  _slugify(text) {
    return String(text)
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
      .replace(/[^a-z0-9]+/g, '-')     // Reemplazar espacios y caracteres raros con guiones
      .replace(/^-+|-+$/g, '');        // Limpiar guiones iniciales y finales
  }
}

export const businessService = new BusinessService();
