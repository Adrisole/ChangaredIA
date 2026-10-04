import mongoose from 'mongoose';
import { config } from './env.js';

let isConnected = false;

/**
 * Conecta a MongoDB si MONGODB_URI está configurado en las variables de entorno.
 * Si no está configurado o falla, opera con persistencia local sin interrumpir la aplicación.
 */
export async function connectDatabase() {
  const uri = config.mongodb.uri || process.env.MONGODB_URI;

  if (!uri) {
    console.log('[Database] MONGODB_URI no detectada. Operando con persistencia JSON local.');
    return false;
  }

  try {
    console.log('[Database] Conectando a MongoDB...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('✅ [Database] Conexión establecida exitosamente con MongoDB.');
    // Migrar automáticamente colecciones locales JSON a MongoDB
    import('../services/migration.service.js')
      .then(m => m.migrateJsonToMongo())
      .catch(err => console.error('[Database] Error en migración automática:', err.message));
    return true;
  } catch (error) {
    console.error('❌ [Database] Error al conectar a MongoDB:', error.message);
    console.log('ℹ️ [Database] Fallback activado: operando con persistencia local.');
    isConnected = false;
    return false;
  }
}

export function isDbConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

export async function disconnectDatabase() {
  if (isConnected) {
    try {
      await mongoose.disconnect();
      isConnected = false;
      console.log('[Database] Desconectado de MongoDB.');
    } catch (err) {
      console.error('[Database] Error al desconectar de MongoDB:', err.message);
    }
  }
}
