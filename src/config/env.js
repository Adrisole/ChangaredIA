import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde el archivo .env
dotenv.config();

export const config = Object.freeze({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'changared_secret_verify_token_2026',
  },
  storage: {
    filePath: path.resolve(process.env.DATA_STORAGE_PATH || './src/data/businesses.json'),
  },
  mongodb: {
    uri: process.env.MONGODB_URI || '',
  },
});
