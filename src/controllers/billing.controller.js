import { billingService, PLANS_CONFIG } from '../services/billing.service.js';
import { paymentService } from '../services/payment.service.js';
import { config } from '../config/env.js';

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
 * POST /api/billing/webhook/mercadopago?country=AR|BR|MX|CL|CO|PE|UY
 * Notificaciones de pago de Mercado Pago (LATAM). Verifica firma y re-consulta el pago a la API de MP.
 */
export const handleMercadoPagoBillingWebhook = async (req, res, next) => {
  try {
    const country = paymentService.resolveMpCountry(req.query.country);
    if (!paymentService.verifyMercadoPagoSignature(req, country)) {
      return res.status(401).json({ received: false, error: 'Firma inválida' });
    }

    const type = req.body?.type || req.query.type || req.body?.topic || req.query.topic;
    const paymentId = req.body?.data?.id || req.query['data.id'] || req.query.id;
    console.log(`[MercadoPago ${country}] Webhook: ${type} id=${paymentId}`);

    if (type === 'payment' && paymentId) {
      const result = await paymentService.handleMercadoPagoPayment(paymentId, country);
      return res.status(200).json({ received: true, ...result });
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/billing/plans
 * Catálogo de planes, precios (ARS/USD) y métodos de pago realmente habilitados.
 */
export const getPlansCatalog = (req, res) => {
  const methods = paymentService.getAvailableMethods();
  const mpPrices = {};
  for (const m of methods.mercadopago.countries) {
    mpPrices[m.country] = Object.fromEntries(
      Object.entries(PLANS_CONFIG).map(([id, plan]) => [id, paymentService.getMercadoPagoPrice(plan, m.country)]),
    );
  }
  res.status(200).json({
    success: true,
    plans: PLANS_CONFIG,
    paymentMethods: methods,
    mercadoPagoPrices: mpPrices,
  });
};

/**
 * POST /api/billing/checkout  { businessId, planId, method: 'mercadopago'|'wise'|'payoneer', country? }
 * Devuelve la URL de checkout (Mercado Pago) o los datos de transferencia/enlace (Wise/Payoneer).
 */
export const createCheckout = async (req, res, next) => {
  try {
    const { businessId, planId, method, country } = req.body || {};
    if (!businessId || !planId || !method) {
      return res.status(400).json({ success: false, message: 'businessId, planId y method son obligatorios.' });
    }
    const checkout = await paymentService.createCheckout({ businessId, planId, method, country });
    return res.status(200).json({ success: true, checkout });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/billing/confirm-manual  { businessId, reference }  (header x-admin-key)
 * Uso interno: activa el plan tras ver acreditado el pago Wise/Payoneer.
 */
export const confirmManualPayment = async (req, res, next) => {
  try {
    const adminKey = config.payments.adminKey;
    if (!adminKey || req.headers['x-admin-key'] !== adminKey) {
      return res.status(403).json({ success: false, message: 'No autorizado.' });
    }
    const { businessId, reference } = req.body || {};
    const billing = await paymentService.confirmManualPayment({ businessId, reference });
    return res.status(200).json({ success: true, billing });
  } catch (error) {
    next(error);
  }
};
