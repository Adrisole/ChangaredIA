import { createApp } from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { businessService } from './services/business.service.js';
import { scheduleDataRetention } from './services/dataRetention.service.js';

// Inicializar conexión a base de datos (MongoDB o fallback JSON)
connectDatabase().catch(err => {
  console.error('[Database] Error inesperado en inicialización de BD:', err);
});

const app = createApp();

// Borrado automático de datos de clientes finales con más de 24 meses sin actividad
scheduleDataRetention();

const server = app.listen(config.port, async () => {
  const businesses = await businessService.getAllBusinesses();
  console.log('================================================================');
  console.log(`🤖 Changared: Plataforma Multi-Tenant de Empleados Virtuales`);
  console.log(`🚀 Servidor ejecutándose en: http://localhost:${config.port}`);
  console.log(`🏢 Negocios activos cargados: ${businesses.length}`);
  console.log(`📝 Onboarding de nuevos negocios: POST http://localhost:${config.port}/api/business/setup`);
  console.log(`💬 Webhook de WhatsApp dinámico: http://localhost:${config.port}/api/webhook/:businessId`);
  console.log(`🔑 OpenAI Configurado: ${Boolean(config.openai.apiKey)} (Modelo: ${config.openai.model})`);
  console.log('================================================================');
});

// Manejo de apagado seguro (Graceful Shutdown)
const gracefulShutdown = async (signal) => {
  console.log(`\n[Server] Señal ${signal} recibida. Cerrando conexiones...`);
  await disconnectDatabase();
  server.close(() => {
    console.log('[Server] Servidor Express cerrado de forma segura.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server Error] Forzando cierre tras timeout.');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
