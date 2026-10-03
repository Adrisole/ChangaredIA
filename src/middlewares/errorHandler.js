/**
 * Middleware centralizado para el manejo de excepciones en Express.
 */
export const errorHandler = (err, req, res, next) => {
  console.error('[Error Handler]', {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
  });

  const statusCode = err.statusCode || err.status || 500;

  res.status(statusCode).json({
    success: false,
    error: err.name || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'Ocurrió un error inesperado en el servidor de Changared.',
    timestamp: new Date().toISOString(),
  });
};
