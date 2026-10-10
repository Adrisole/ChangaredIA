import crypto from 'crypto';
import { config } from '../config/env.js';
import { businessService } from './business.service.js';
import { businessRepository } from '../repositories/business.repository.js';
import { encryptionService } from './encryption.service.js';

const GRAPH_URL = 'https://graph.facebook.com';
const NUMERIC_ID = /^\d{5,25}$/;

/**
 * Registro integrado de WhatsApp (Embedded Signup) para Tech Providers.
 * El comercio inicia sesión con Meta en una ventana; Meta devuelve un código canjeable
 * y los IDs de su cuenta y número. Acá se completan los pasos posteriores:
 * canjear el código, suscribir la app a la cuenta, registrar el número y guardarlo.
 */
class MetaEmbeddedSignupService {
  isEnabled() {
    const { appId, appSecret, embeddedSignupConfigId } = config.meta;
    return Boolean(appId && appSecret && embeddedSignupConfigId);
  }

  /** Datos públicos que necesita el navegador para abrir la ventana de Meta. */
  publicConfig() {
    const enabled = this.isEnabled();
    return {
      enabled,
      appId: enabled ? config.meta.appId : '',
      configId: enabled ? config.meta.embeddedSignupConfigId : '',
      graphVersion: config.whatsapp.apiVersion,
    };
  }

  async _graph(path, { method = 'GET', token, query, body } = {}) {
    const url = new URL(`${GRAPH_URL}/${config.whatsapp.apiVersion}${path}`);
    Object.entries(query || {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const response = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const error = new Error(data.error?.message || `Meta respondió HTTP ${response.status}`);
      error.metaCode = data.error?.code;
      throw error;
    }
    return data;
  }

  /**
   * Completa la conexión de un comercio después de la ventana de Meta.
   * Devuelve el negocio actualizado. Lanza un error con `step` si algún paso falla.
   */
  async completeSignup(businessId, { code, wabaId, phoneNumberId }) {
    if (!this.isEnabled()) {
      throw Object.assign(new Error('La conexión en un clic todavía no está habilitada.'), { status: 409 });
    }
    if (typeof code !== 'string' || !code.trim() || code.length > 4096) {
      throw Object.assign(new Error('Falta el código de autorización de Meta.'), { status: 400 });
    }
    if (!NUMERIC_ID.test(String(wabaId || '')) || !NUMERIC_ID.test(String(phoneNumberId || ''))) {
      throw Object.assign(new Error('Meta no devolvió los datos de la cuenta y el número de WhatsApp.'), { status: 400 });
    }

    const run = async (step, fn) => {
      try { return await fn(); } catch (error) { error.step = step; error.status = 502; throw error; }
    };

    // 1. Canjear el código por un token de negocio (llamada servidor a servidor).
    const { access_token: token } = await run('token', () => this._graph('/oauth/access_token', {
      query: { client_id: config.meta.appId, client_secret: config.meta.appSecret, code: code.trim() },
    }));
    if (!token) throw Object.assign(new Error('Meta no entregó el token del negocio.'), { step: 'token', status: 502 });

    // Guardar enseguida: si un paso posterior falla, se puede reintentar sin repetir la ventana.
    await businessService.updateWhatsAppConfig(businessId, {
      whatsappAccessToken: token,
      whatsappPhoneNumberId: String(phoneNumberId),
      whatsappBusinessAccountId: String(wabaId),
      whatsappConnected: false,
    });

    // 2. Suscribir la app de Changared a los mensajes de esa cuenta de WhatsApp.
    await run('subscribe', () => this._graph(`/${wabaId}/subscribed_apps`, { method: 'POST', token }));

    // 3. Registrar el número en la Cloud API. Si el número no tenía verificación en dos pasos,
    //    este PIN pasa a ser el suyo; se guarda cifrado para no perderlo.
    const pin = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await run('register', () => this._graph(`/${phoneNumberId}/register`, {
      method: 'POST', token, body: { messaging_product: 'whatsapp', pin },
    }));

    // 4. Número visible y nombre verificado, para mostrarlos en el panel.
    const info = await run('phone', () => this._graph(`/${phoneNumberId}`, {
      token, query: { fields: 'display_phone_number,verified_name' },
    }));

    const updated = await businessService.updateWhatsAppConfig(businessId, {
      phone: info.display_phone_number || undefined,
      whatsappConnected: true,
    });
    return businessRepository.save({ ...updated, whatsappTwoStepPin: encryptionService.encrypt(pin) });
  }
}

export const metaEmbeddedSignupService = new MetaEmbeddedSignupService();
