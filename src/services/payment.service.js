import crypto from 'crypto';
import { config } from '../config/env.js';
import { PLANS_CONFIG, billingService } from './billing.service.js';
import { businessService } from './business.service.js';
import { businessRepository } from '../repositories/business.repository.js';

/**
 * Capa de pagos de Changared.
 *
 *  - ARS (Argentina)  -> Mercado Pago: checkout automático (Checkout Pro) + webhook verificado.
 *  - USD (Internacional) -> Wise / Payoneer: link de cobro o transferencia. Se genera una
 *    referencia única por solicitud; el pago se concilia con POST /api/billing/confirm-manual.
 *
 * Variables .env necesarias: ver .env.example (sección "PAGOS Y COBROS").
 */

const MP_API = 'https://api.mercadopago.com';

export const PAYMENT_METHODS = Object.freeze({
  mercadopago: { currency: 'LATAM', label: 'Mercado Pago', kind: 'checkout' },
  wise: { currency: 'USD', label: 'Wise', kind: 'transfer' },
  payoneer: { currency: 'USD', label: 'Payoneer', kind: 'transfer' },
});

export class PaymentService {
  /** Precio local de un plan en el país de Mercado Pago indicado (null si falta tipo de cambio). */
  getMercadoPagoPrice(plan, country) {
    const c = config.payments.mercadopago.countries[country];
    if (!c) return null;
    if (country === 'AR') return plan.priceArs;
    return c.fxPerUsd ? Math.round(plan.priceUsd * c.fxPerUsd) : null;
  }

  /** Indica qué métodos están realmente configurados en el .env (sin exponer secretos). */
  getAvailableMethods() {
    const { mercadopago, wise, payoneer } = config.payments;
    const mpCountries = Object.entries(mercadopago.countries)
      .filter(([cc, c]) => c.accessToken && (cc === 'AR' || c.fxPerUsd))
      .map(([cc, c]) => ({ country: cc, name: c.name, currency: c.currency }));
    return {
      mercadopago: { ...PAYMENT_METHODS.mercadopago, enabled: mpCountries.length > 0, countries: mpCountries },
      wise: { ...PAYMENT_METHODS.wise, enabled: Boolean(wise.paymentLink || wise.email || wise.usdAccountDetails) },
      payoneer: { ...PAYMENT_METHODS.payoneer, enabled: Boolean(payoneer.paymentLink || payoneer.email) },
    };
  }

  /**
   * Crea una solicitud de cobro para un negocio/plan con el método elegido.
   * Para Mercado Pago se indica `country` (AR, BR, MX, CL, CO, PE, UY).
   * @returns {Promise<object>} datos para mostrar en el panel (url de checkout o instrucciones de transferencia).
   */
  async createCheckout({ businessId, planId, method, country }) {
    const plan = PLANS_CONFIG[planId];
    if (!plan) throw this.#httpError(400, `Plan '${planId}' inexistente.`);

    const methodInfo = PAYMENT_METHODS[method];
    if (!methodInfo) throw this.#httpError(400, `Método de pago '${method}' no soportado.`);

    const business = await businessService.getBusinessById(businessId);
    if (!business) throw this.#httpError(404, `Negocio '${businessId}' no encontrado.`);

    if (method === 'mercadopago') {
      const cc = String(country || config.payments.mercadopago.defaultCountry).toUpperCase();
      return this.#createMercadoPagoPreference({ business, planId, plan, country: cc });
    }
    return this.#createTransferRequest({ business, planId, plan, amount: plan.priceUsd, method });
  }

  // ---------------------------------------------------------------- Mercado Pago (LATAM)

  async #createMercadoPagoPreference({ business, planId, plan, country }) {
    const mp = config.payments.mercadopago.countries[country];
    if (!mp) throw this.#httpError(400, `Mercado Pago no opera en '${country}' (usa AR, BR, MX, CL, CO, PE o UY).`);
    if (!mp.accessToken) throw this.#httpError(503, `Mercado Pago ${mp.name} no está configurado (falta MP_ACCESS_TOKEN_${country}).`);
    const amount = this.getMercadoPagoPrice(plan, country);
    if (!amount) throw this.#httpError(503, `Falta el tipo de cambio MP_FX_${mp.currency} para cobrar en ${mp.currency}.`);

    const base = config.payments.publicBaseUrl;
    const businessId = business.id || business.businessId;
    const body = {
      items: [{
        id: planId,
        title: `Changared - ${plan.name} (abono mensual)`,
        quantity: 1,
        currency_id: mp.currency,
        unit_price: amount,
      }],
      external_reference: `${businessId}|${planId}|${country}`,
      metadata: { business_id: businessId, plan_id: planId, country },
    };
    if (base) {
      body.notification_url = `${base}/api/billing/webhook/mercadopago?country=${country}`;
      body.back_urls = {
        success: `${base}/dashboard.html?pago=ok`,
        pending: `${base}/dashboard.html?pago=pendiente`,
        failure: `${base}/dashboard.html?pago=error`,
      };
      if (base.startsWith('https://')) body.auto_return = 'approved';
    }

    const resp = await fetch(`${MP_API}/checkout/preferences`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mp.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[PaymentService] Error Mercado Pago:', resp.status, data);
      throw this.#httpError(502, 'Mercado Pago rechazó la creación del checkout.');
    }

    return {
      method: 'mercadopago',
      kind: 'checkout',
      country,
      currency: mp.currency,
      amount,
      planId,
      checkoutUrl: data.init_point,
      preferenceId: data.id,
    };
  }


  /** Normaliza el país del webhook (?country=XX); cae al país por defecto si es inválido. */
  resolveMpCountry(raw) {
    const cc = String(raw || '').toUpperCase();
    return config.payments.mercadopago.countries[cc] ? cc : config.payments.mercadopago.defaultCountry;
  }

  /**
   * Valida la firma x-signature de Mercado Pago (si MP_WEBHOOK_SECRET_<PAIS> está configurado).
   * Manifest: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
   */
  verifyMercadoPagoSignature(req, country) {
    const secret = config.payments.mercadopago.countries[country]?.webhookSecret;
    if (!secret) return true; // sin secreto configurado: se confía en la re-consulta a la API de MP
    const signature = req.headers['x-signature'];
    if (!signature) return false;

    const parts = Object.fromEntries(signature.split(',').map((p) => p.trim().split('=')));
    const dataId = String(req.query['data.id'] || req.body?.data?.id || '').toLowerCase();
    const manifest = `id:${dataId};request-id:${req.headers['x-request-id'] || ''};ts:${parts.ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    if (!parts.v1 || parts.v1.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
  }

  /**
   * Procesa una notificación de pago de Mercado Pago. Nunca confía en el body:
   * consulta el pago real a la API de MP (con el token del país) y activa la suscripción solo si está "approved".
   */
  async handleMercadoPagoPayment(paymentId, country) {
    const mp = config.payments.mercadopago.countries[country];
    if (!mp?.accessToken) throw this.#httpError(503, `Mercado Pago ${country} no está configurado.`);

    const resp = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mp.accessToken}` },
    });
    if (!resp.ok) throw this.#httpError(502, `No se pudo verificar el pago ${paymentId} en Mercado Pago.`);
    const payment = await resp.json();

    if (payment.status !== 'approved') return { activated: false, status: payment.status };

    const [businessId, planId] = String(payment.external_reference || '').split('|');
    if (!businessId || !PLANS_CONFIG[planId]) {
      console.warn('[PaymentService] Pago MP aprobado sin external_reference válido:', paymentId);
      return { activated: false, status: 'no_reference' };
    }

    await billingService.activateSubscription({
      businessId,
      planId,
      provider: 'mercadopago',
      currency: payment.currency_id || mp.currency,
      externalSubscriptionId: `MP-${payment.id}`,
    });
    return { activated: true, businessId, planId };
  }

  // ---------------------------------------------------------------- Wise / Payoneer (USD)

  async #createTransferRequest({ business, planId, plan, amount, method }) {
    const cfg = config.payments[method];
    const available = this.getAvailableMethods()[method];
    if (!available.enabled) {
      throw this.#httpError(503, `${PAYMENT_METHODS[method].label} no está configurado en el servidor (.env).`);
    }

    const businessId = business.id || business.businessId;
    const reference = `CHG-${businessId}-${Date.now().toString(36)}`.toUpperCase();

    // Se guarda la solicitud pendiente para poder conciliarla luego.
    business.billing = {
      ...(business.billing || {}),
      pendingPayment: {
        reference, method, planId, currency: 'USD', amount,
        status: 'AWAITING_TRANSFER', createdAt: new Date().toISOString(),
      },
    };
    await businessRepository.save(business);

    return {
      method,
      kind: 'transfer',
      currency: 'USD',
      amount,
      planId,
      reference,
      paymentLink: cfg.paymentLink || null,
      accountHolder: cfg.accountHolder || null,
      email: cfg.email || null,
      accountDetails: cfg.usdAccountDetails || null,
      instructions:
        `Paga USD ${amount} por el ${plan.name}. Incluye la referencia ${reference} en el concepto/nota ` +
        'del pago. Activaremos tu plan al confirmar la acreditación (normalmente en menos de 24 h hábiles).',
    };
  }

  /**
   * Confirma manualmente un pago Wise/Payoneer recibido (uso interno, protegido con x-admin-key).
   */
  async confirmManualPayment({ businessId, reference }) {
    const business = await businessService.getBusinessById(businessId);
    const pending = business?.billing?.pendingPayment;
    if (!pending || pending.reference !== reference) {
      throw this.#httpError(404, 'No hay un pago pendiente con esa referencia para el negocio indicado.');
    }

    const activated = await billingService.activateSubscription({
      businessId,
      planId: pending.planId,
      provider: pending.method, // 'wise' | 'payoneer'
      currency: 'USD',
      externalSubscriptionId: reference,
    });

    // activateSubscription reconstruye billing: se limpia la solicitud pendiente.
    const fresh = await businessService.getBusinessById(businessId);
    if (fresh?.billing?.pendingPayment) {
      delete fresh.billing.pendingPayment;
      await businessRepository.save(fresh);
    }
    return activated;
  }

  #httpError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
  }
}

export const paymentService = new PaymentService();
