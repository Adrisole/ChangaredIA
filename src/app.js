import express from 'express';
import cors from 'cors';
import path from 'path';
import apiRouter from './routes/index.js';
import { config } from './config/env.js';
import { isDbConnected } from './config/database.js';
import { errorHandler } from './middlewares/errorHandler.js';

export const createApp = () => {
  const app = express();

  // Middlewares esenciales
  app.use(cors());
  app.use(express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.static('public'));

  // Auditoría básica de solicitudes
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // Ruta dedicada para TalleExacto
  app.get('/talleexacto', (req, res) => {
    res.sendFile(path.resolve('./public/talleexacto.html'));
  });

  // Ruta dedicada para Gestor de Cobranzas
  app.get('/cobranzas', (req, res) => {
    res.sendFile(path.resolve('./public/cobranzas.html'));
  });

  app.get('/agenda', (req, res) => {
    res.sendFile(path.resolve('./public/agenda.html'));
  });

  // Ruta dedicada para Asistente Multilingüe y Turismo
  app.get('/multilingue', (req, res) => {
    res.sendFile(path.resolve('./public/multilingue.html'));
  });

  // Rutas SEO (Google & Motores de Búsqueda)
  app.get('/robots.txt', (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.sendFile(path.resolve('./public/robots.txt'));
  });

  app.get('/sitemap.xml', (req, res) => {
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.sendFile(path.resolve('./public/sitemap.xml'));
  });

  // Montar rutas de la API bajo /api
  app.use('/api', (req, res, next) => {
    if (config.mongodb.uri && !isDbConnected() && !['/status', '/health'].includes(req.path)) {
      return res.status(503).json({ success: false, message: 'La base de datos está desconectada o iniciando. Tus datos no se cargarán ni guardarán en una copia local. Intentá nuevamente cuando se restablezca la conexión.' });
    }
    next();
  }, apiRouter);

  // Manejo de URLs históricas y 404 (SEO Recovery 301)
  app.use('*', (req, res) => {
    if (req.originalUrl.startsWith('/api')) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: `El endpoint '${req.originalUrl}' no existe en Changared.`,
      });
    }

    // Redirigir cualquier enlace antiguo del Changared previo al home (SEO 301 permanente)
    return res.redirect(301, '/');
  });

  // Manejador central de errores
  app.use(errorHandler);

  return app;
};
