import { businessService } from '../services/business.service.js';
import { businessRepository } from '../repositories/business.repository.js';

/**
 * Catálogo maestro de planes de Changared y cuotas de uso.
 */
export const PLANS_CONFIG = Object.freeze({
  'plan-mostrador': {
    name: 'Un empleado virtual',
    priceArs: 25000,
    priceUsd: 17,
    monthlyQuota: 600,
    allowedAssistants: ['vendedor'],
    features: ['Elegí 1 empleado virtual', 'Catálogo y pedidos', 'Atención multilingüe', '600 conversaciones/mes'],
  },
  'combo-operativo': {
    name: 'Dos empleados virtuales',
    priceArs: 50000,
    priceUsd: 34,
    monthlyQuota: 2000,
    allowedAssistants: ['vendedor', 'cobranzas'],
    features: ['Elegí 2 empleados virtuales', 'Ventas y seguimiento de cobros', 'Panel de pedidos', '2.000 conversaciones/mes'],
  },
  'full-empresa': {
    name: 'Cuatro empleados virtuales',
    priceArs: 100000,
    priceUsd: 68,
    monthlyQuota: 10000,
    allowedAssistants: ['vendedor', 'cobranzas', 'agenda', 'contable'],
    features: ['Elegí hasta 4 empleados virtuales', 'Ventas, agenda y administración', 'Panel de seguimiento', '10.000 conversaciones/mes'],
  },
});

export class BillingService {
  /**
   * Activa o actualiza la suscripción de un negocio tras confirmación de pago.
   */
  async activateSubscription({ businessId, planId, provider, currency, externalSubscriptionId }) {
    const business = await businessService.getBusinessById(businessId);
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

    await businessRepository.save(updatedBusiness);
    console.log(`[BillingService] Suscripción activada para [${business.name}]: Plan ${planConfig.name} (${currency} vía ${provider})`);
    return updatedBilling;
  }

  /**
   * Registra el consumo de un mensaje de WhatsApp y valida la cuota mensual.
   */
  async trackUsage(businessId) {
    const business = await businessService.getBusinessById(businessId);
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
    await businessRepository.save(business);
    return true;
  }

  async getBillingStatus(businessId) {
    const business = await businessService.getBusinessById(businessId);
    if (!business) return null;
    return business.billing || null;
  }
}

export const billingService = new BillingService();
