import { billingService, PLANS_CONFIG } from '../services/billing.service.js';

/**
 * Controlador de Webhooks de Facturación (Lemon Squeezy y Mercado Pago).
 */

/**
 * POST /api/webhook/billing/lemonsqueezy
 * Procesa eventos de cobro en USD desde Lemon Squeezy.
 */
export const handleLemonSqueezyWebhook = async (req, res, next) => {
  try {
    const event = req.body;
    const eventName = event?.meta?.event_name;
    const customData = event?.meta?.custom_data || {};
    const businessId = customData.business_id || customData.businessId || 'mi-empresa';

    console.log(`[LemonSqueezy Webhook] Evento recibido: ${eventName} para tenant: ${businessId}`);

    if (eventName === 'subscription_created' || eventName === 'subscription_payment_success') {
      const variantName = event?.data?.attributes?.variant_name || '';
      let planId = 'combo-operativo';

      if (variantName.toLowerCase().includes('mostrador')) planId = 'plan-mostrador';
      else if (variantName.toLowerCase().includes('empresa') || variantName.toLowerCase().includes('full')) planId = 'full-empresa';

      billingService.activateSubscription({
        businessId,
        planId,
        provider: 'lemonsqueezy',
        currency: 'USD',
        externalSubscriptionId: event?.data?.id,
      });
    }

    return res.status(200).json({ received: true, event: eventName });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/webhook/billing/mercadopago
 * Procesa eventos de suscripción en Pesos Argentinos (ARS) desde Mercado Pago.
 */
export const handleMercadoPagoBillingWebhook = async (req, res, next) => {
  try {
    const payload = req.body;
    const type = payload?.type || payload?.action;
    const businessId = req.query.businessId || payload?.data?.metadata?.business_id || 'mi-empresa';

    console.log(`[MercadoPago Billing] Webhook recibido: ${type} para tenant: ${businessId}`);

    // Si se aprobó el pago o la suscripción
    if (type === 'payment' || type === 'subscription_preapproval') {
      billingService.activateSubscription({
        businessId,
        planId: 'combo-operativo', // Plan por defecto o detectado del metadata
        provider: 'mercadopago',
        currency: 'ARS',
        externalSubscriptionId: payload?.data?.id || `MP-${Date.now()}`,
      });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/billing/plans
 * Devuelve el catálogo de planes y precios en ARS y USD.
 */
export const getPlansCatalog = (req, res) => {
  res.status(200).json({
    success: true,
    plans: PLANS_CONFIG,
    paymentMethods: {
      argentina: {
        currency: 'ARS',
        provider: 'Mercado Pago (Suscripción mensual recurrente)',
      },
      international: {
        currency: 'USD',
        provider: 'Lemon Squeezy (Tarjetas Internacionales / Apple Pay / PayPal)',
        payoutDestinations: ['Wise (ACH $0)', 'Payoneer ($1)', 'AstroPay'],
      },
    },
  });
};
