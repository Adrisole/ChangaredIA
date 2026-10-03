import { businessService } from '../services/business.service.js';
import { businessRepository } from '../repositories/business.repository.js';

/**
 * Catálogo maestro de planes de Changared y cuotas de uso.
 */
export const PLANS_CONFIG = Object.freeze({
  'plan-mostrador': {
    name: 'Plan Mostrador',
    priceArs: 39000,
    priceUsd: 29,
    monthlyQuota: 600,
    allowedAssistants: ['whatsapp-employee'],
    features: ['1 Asistente WhatsApp', 'Catálogo & Stock 24/7', 'Multi-idioma nativo', '600 chats/mes'],
  },
  'combo-operativo': {
    name: 'Plan Operativo (Combo ⭐)',
    priceArs: 89000,
    priceUsd: 69,
    monthlyQuota: 2000,
    allowedAssistants: ['whatsapp-employee', 'radar-operativo'],
    features: ['2 Asistentes (WhatsApp + Radar)', 'Rescate de pagos caídos', 'Alertas stock crítico', '2.000 chats/mes'],
  },
  'full-empresa': {
    name: 'Plan Full Empresa',
    priceArs: 169000,
    priceUsd: 129,
    monthlyQuota: 10000,
    allowedAssistants: ['whatsapp-employee', 'radar-operativo', 'stock-sentinel', 'finance-reconciler'],
    features: ['Suite completa (4 Asistentes)', 'Chats ilimitados', 'Soporte prioritario', 'Conciliación financiera'],
  },
});

export class BillingService {
  /**
   * Activa o actualiza la suscripción de un negocio tras confirmación de pago.
   */
  activateSubscription({ businessId, planId, provider, currency, externalSubscriptionId }) {
    const business = businessService.getBusinessById(businessId);
    if (!business) {
      throw new Error(`Negocio '${businessId}' no encontrado para activar suscripción.`);
    }

    const planConfig = PLANS_CONFIG[planId] || PLANS_CONFIG['combo-operativo'];

    const updatedBilling = {
      planId,
      planName: planConfig.name,
      provider, // 'lemonsqueezy' | 'mercadopago' | 'manual'
      currency, // 'USD' | 'ARS'
      status: 'ACTIVE',
      externalSubscriptionId: externalSubscriptionId || `SUB-${Date.now()}`,
      quota: {
        conversationsLimit: planConfig.monthlyQuota,
        conversationsUsed: business.billing?.quota?.conversationsUsed || 0,
      },
      allowedAssistants: planConfig.allowedAssistants,
      updatedAt: new Date().toISOString(),
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const updatedBusiness = {
      ...business,
      billing: updatedBilling,
    };

    businessRepository.save(updatedBusiness);
    console.log(`[BillingService] Suscripción activada para [${business.name}]: Plan ${planConfig.name} (${currency} vía ${provider})`);
    return updatedBilling;
  }

  /**
   * Registra el consumo de un mensaje de WhatsApp y valida la cuota mensual.
   */
  trackUsage(businessId) {
    const business = businessService.getBusinessById(businessId);
    if (!business) return false;

    if (!business.billing) {
      // Si no tiene plan explícito, se le asigna período de prueba
      business.billing = {
        planId: 'plan-mostrador',
        planName: 'Período de Prueba',
        status: 'ACTIVE',
        quota: { conversationsLimit: 200, conversationsUsed: 0 },
      };
    }

    business.billing.quota.conversationsUsed = (business.billing.quota.conversationsUsed || 0) + 1;
    businessRepository.save(business);
    return true;
  }

  getBillingStatus(businessId) {
    const business = businessService.getBusinessById(businessId);
    if (!business) return null;
    return business.billing || null;
  }
}

export const billingService = new BillingService();
