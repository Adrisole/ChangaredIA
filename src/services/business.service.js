import { businessRepository } from '../repositories/business.repository.js';
import { authService } from './auth.service.js';

/**
 * Servicio de Negocios y Onboarding Multi-Tenant.
 */
export class BusinessService {
  /**
   * Registra o actualiza la configuración de un negocio en la plataforma.
   */
  setupBusiness(payload, userId = null) {
    const { id, name, description, toneOfVoice, businessRules, catalog } = payload;

    if (!name || typeof name !== 'string') {
      throw new Error("El campo 'name' (Nombre del negocio) es obligatorio.");
    }

    if (!description || typeof description !== 'string') {
      throw new Error("El campo 'description' es obligatorio para contextualizar al agente virtual.");
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

    const existing = businessRepository.findById(businessId);

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
      paymentMethod: payload.paymentMethod || existing?.paymentMethod || 'pagos.miempresa.mp',
      toneOfVoice: toneOfVoice || existing?.toneOfVoice || 'amigable, respetuoso y dispuesto a ayudar',
      language: payload.language || existing?.language || 'Español',
      autoDetectLanguage: payload.autoDetectLanguage !== undefined ? Boolean(payload.autoDetectLanguage) : (existing?.autoDetectLanguage ?? true),
      businessRules: normalizedRules.length > 0 ? normalizedRules : (existing?.businessRules || []),
      catalog: normalizedCatalog.length > 0 ? normalizedCatalog : (existing?.catalog || []),
      services: Array.isArray(payload.services) && payload.services.length > 0 ? payload.services : (existing?.services || []),
      activeEmployees: Array.isArray(payload.activeEmployees) && payload.activeEmployees.length > 0 ? payload.activeEmployees : (existing?.activeEmployees || ['vendedor']),
      ownerId: userId || payload.userId || payload.ownerId || existing?.ownerId || null,
      whatsappConnected: payload.whatsappConnected !== undefined ? Boolean(payload.whatsappConnected) : (existing?.whatsappConnected ?? false),
      whatsappPhoneNumberId: payload.whatsappPhoneNumberId !== undefined ? payload.whatsappPhoneNumberId : (existing?.whatsappPhoneNumberId || ''),
      whatsappAccessToken: payload.whatsappAccessToken !== undefined ? payload.whatsappAccessToken : (existing?.whatsappAccessToken || ''),
      whatsappBusinessAccountId: payload.whatsappBusinessAccountId !== undefined ? payload.whatsappBusinessAccountId : (existing?.whatsappBusinessAccountId || ''),
      calendarConnected: payload.calendarConnected !== undefined ? Boolean(payload.calendarConnected) : (existing?.calendarConnected ?? false),
      calendarEmail: payload.calendarEmail !== undefined ? payload.calendarEmail : (existing?.calendarEmail || ''),
      driveFolder: payload.driveFolder !== undefined ? payload.driveFolder : (existing?.driveFolder || ''),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    const saved = businessRepository.save(businessData);

    // Si hay un usuario propietario, vincularlo
    if (saved.ownerId) {
      authService.linkBusiness(saved.ownerId, saved.id);
    }

    return saved;
  }

  updateWhatsAppConfig(businessId, configData) {
    const business = businessRepository.findById(businessId);
    if (!business) {
      throw new Error(`El negocio '${businessId}' no existe.`);
    }

    const updated = {
      ...business,
      phone: configData.phone !== undefined ? String(configData.phone).trim() : business.phone,
      whatsappConnected: configData.whatsappConnected !== undefined ? Boolean(configData.whatsappConnected) : business.whatsappConnected,
      whatsappPhoneNumberId: configData.whatsappPhoneNumberId !== undefined ? String(configData.whatsappPhoneNumberId).trim() : (business.whatsappPhoneNumberId || ''),
      whatsappAccessToken: configData.whatsappAccessToken !== undefined ? String(configData.whatsappAccessToken).trim() : (business.whatsappAccessToken || ''),
      whatsappBusinessAccountId: configData.whatsappBusinessAccountId !== undefined ? String(configData.whatsappBusinessAccountId).trim() : (business.whatsappBusinessAccountId || ''),
      updatedAt: new Date().toISOString(),
    };

    return businessRepository.save(updated);
  }

  getBusinessById(businessId) {
    return businessRepository.findById(businessId);
  }

  getBusinessesByOwnerId(ownerId) {
    if (!ownerId) return [];
    return businessRepository.findAll().filter(b => b.ownerId === ownerId);
  }

  getAllBusinesses() {
    return businessRepository.findAll();
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
