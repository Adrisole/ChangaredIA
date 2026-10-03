import express from 'express';
import cors from 'cors';
import path from 'path';
import apiRouter from './routes/index.js';
import { errorHandler } from './middlewares/errorHandler.js';

export const createApp = () => {
  const app = express();

  // Middlewares esenciales
  app.use(cors());
  app.use(express.json());
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

  // Montar rutas de la API bajo /api
  app.use('/api', apiRouter);

  // Ruta 404
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `El endpoint '${req.originalUrl}' no existe en Changared.`,
    });
  });

  // Manejador central de errores
  app.use(errorHandler);

  return app;
};
