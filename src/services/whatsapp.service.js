import crypto from 'crypto';
import { config } from '../config/env.js';

/**
 * Servicio de Integración con WhatsApp Business Platform (Meta Cloud API).
 * Permite enviar mensajes reales a clientes usando la API oficial /{phone-number-id}/messages
 * y valida firmas de seguridad x-hub-signature-256.
 */
export class WhatsAppService {
  constructor() {
    this.apiVersion = config.whatsapp.apiVersion || 'v20.0';
  }

  /**
   * Envía un mensaje de texto a un cliente a través de WhatsApp Cloud API.
   * Si las credenciales de Meta están configuradas (por negocio o globales), realiza la llamada HTTP real.
   * Si no están configuradas, opera en modo simulado para pruebas locales sin romper el flujo.
   */
  async sendTextMessage({ to, text, business = null, phoneNumberId = null, accessToken = null }) {
    if (!to || !text) {
      throw new Error("Los campos 'to' y 'text' son obligatorios para enviar un mensaje de WhatsApp.");
    }

    // Normalizar número telefónico (solo dígitos, sin '+', guiones ni espacios)
    const cleanTo = String(to).replace(/[^\d]/g, '');

    // Determinar credenciales: primero a nivel tenant (negocio), fallback a variables de entorno globales
    const activePhoneNumberId = business?.whatsappPhoneNumberId || phoneNumberId || config.whatsapp.phoneNumberId;
    const activeAccessToken = business?.whatsappAccessToken || accessToken || config.whatsapp.accessToken;

    // Si tenemos credenciales oficiales de Meta, enviar llamada real
    if (activePhoneNumberId && activeAccessToken) {
      const url = `https://graph.facebook.com/${this.apiVersion}/${activePhoneNumberId}/messages`;
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: false,
          body: String(text).trim(),
        },
      };

      try {
        console.log(`[WhatsAppService] Enviando mensaje real a [${cleanTo}] mediante Meta Cloud API (${url})...`);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${activeAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error(`[WhatsAppService] Error en respuesta de Meta Graph API (${response.status}):`, data);
          return {
            success: false,
            simulated: false,
            error: data.error || { message: `HTTP ${response.status}: Error de Meta Graph API` },
            statusCode: response.status,
            to: cleanTo,
            text,
            timestamp: new Date().toISOString(),
          };
        }

        const messageId = data.messages?.[0]?.id || `meta_${Date.now()}`;
        console.log(`[WhatsAppService] Mensaje entregado exitosamente a Meta. ID: ${messageId}`);
        return {
          success: true,
          simulated: false,
          sent: true,
          messageId,
          to: cleanTo,
          text,
          metaResponse: data,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        console.error(`[WhatsAppService] Excepción de red al contactar Meta Cloud API:`, err.message);
        return {
          success: false,
          simulated: false,
          error: { message: err.message },
          to: cleanTo,
          text,
          timestamp: new Date().toISOString(),
        };
      }
    }

    // Si no hay credenciales configuradas, registrar simulación controlada
    console.log(`[WhatsAppService] MODO SIMULADO: Mensaje a [${cleanTo}] generado (sin credenciales de Meta): "${text.substring(0, 60)}..."`);
    return {
      success: true,
      simulated: true,
      sent: false,
      messageId: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      to: cleanTo,
      text,
      note: 'Credenciales de Meta Cloud API no configuradas. Mensaje procesado en modo de prueba local.',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Valida la firma criptográfica x-hub-signature-256 enviada por los servidores de Meta.
   */
  validateSignature(rawBody, signatureHeader, appSecret = null) {
    const secret = appSecret || config.whatsapp.appSecret;
    if (!secret) {
      // Si no se configuró secret, no bloqueamos la petición
      return true;
    }

    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const signature = signatureHeader.substring(7);
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
    } catch {
      return false;
    }
  }
}

export const whatsappService = new WhatsAppService();
