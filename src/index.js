import { createApp } from './app.js';
import { config } from './config/env.js';
import { businessService } from './services/business.service.js';

const app = createApp();

const server = app.listen(config.port, () => {
  const businesses = businessService.getAllBusinesses();
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
const gracefulShutdown = (signal) => {
  console.log(`\n[Server] Señal ${signal} recibida. Cerrando conexiones...`);
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
