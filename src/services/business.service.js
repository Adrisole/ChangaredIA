import { businessRepository } from '../repositories/business.repository.js';

/**
 * Servicio de Negocios y Onboarding Multi-Tenant.
 */
export class BusinessService {
  /**
   * Registra o actualiza la configuración de un negocio en la plataforma.
   */
  setupBusiness(payload) {
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

    const businessData = {
      id: businessId,
      name: name.trim(),
      description: description.trim(),
      rubro: payload.rubro || 'General',
      phone: payload.phone || '',
      email: payload.email || '',
      hours: payload.hours || '',
      website: payload.website || '',
      deposit: Number(payload.deposit) || 5000,
      toneOfVoice: toneOfVoice || 'amigable, respetuoso y dispuesto a ayudar',
      language: payload.language || 'Español',
      autoDetectLanguage: payload.autoDetectLanguage !== undefined ? Boolean(payload.autoDetectLanguage) : true,
      businessRules: normalizedRules,
      catalog: normalizedCatalog,
      services: Array.isArray(payload.services) ? payload.services : [],
      createdAt: new Date().toISOString(),
    };

    const saved = businessRepository.save(businessData);
    return saved;
  }

  getBusinessById(businessId) {
    return businessRepository.findById(businessId);
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
