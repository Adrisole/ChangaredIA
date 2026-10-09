import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde el archivo .env
dotenv.config();
if (!process.env.WHATSAPP_VERIFY_TOKEN) {
  throw new Error('Falta WHATSAPP_VERIFY_TOKEN en las variables de entorno');
  
export const config = Object.freeze({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
  },
  storage: {
    filePath: path.resolve(process.env.DATA_STORAGE_PATH || './src/data/businesses.json'),
  },
  mongodb: {
    uri: process.env.MONGODB_URI || '',
  },
  payments: {
    // URL pública del backend (para notification_url / back_urls). Ej: https://app.changared.com
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
    // Clave para confirmar manualmente pagos recibidos por Wise/Payoneer (header x-admin-key)
    adminKey: process.env.BILLING_ADMIN_KEY || '',
    // Mercado Pago LATAM: cada país es una cuenta/aplicación distinta con su propia moneda.
    // Credenciales: MP_ACCESS_TOKEN_<PAIS>, MP_WEBHOOK_SECRET_<PAIS>. Para AR también vale MP_ACCESS_TOKEN.
    // Fuera de AR el precio = precio USD del plan x MP_FX_<MONEDA> (pesos locales por 1 USD).
    mercadopago: {
      defaultCountry: (process.env.MP_DEFAULT_COUNTRY || 'AR').toUpperCase(),
      countries: Object.fromEntries(
        [
          ['AR', 'ARS', 'Argentina'], ['BR', 'BRL', 'Brasil'], ['MX', 'MXN', 'México'],
          ['CL', 'CLP', 'Chile'], ['CO', 'COP', 'Colombia'], ['PE', 'PEN', 'Perú'],
          ['UY', 'UYU', 'Uruguay'],
        ].map(([cc, currency, name]) => [cc, {
          name,
          currency,
          accessToken: process.env[`MP_ACCESS_TOKEN_${cc}`] || (cc === 'AR' ? process.env.MP_ACCESS_TOKEN : '') || '',
          webhookSecret: process.env[`MP_WEBHOOK_SECRET_${cc}`] || (cc === 'AR' ? process.env.MP_WEBHOOK_SECRET : '') || '',
          fxPerUsd: parseFloat(process.env[`MP_FX_${currency}`] || '') || null,
        }]),
      ),
    },
    wise: {
      paymentLink: process.env.WISE_PAYMENT_LINK || '',
      accountHolder: process.env.WISE_ACCOUNT_HOLDER || '',
      email: process.env.WISE_EMAIL || '',
      usdAccountDetails: process.env.WISE_USD_ACCOUNT_DETAILS || '',
    },
    payoneer: {
      paymentLink: process.env.PAYONEER_PAYMENT_LINK || '',
      email: process.env.PAYONEER_EMAIL || '',
      accountHolder: process.env.PAYONEER_ACCOUNT_HOLDER || '',
    },
  },
});
