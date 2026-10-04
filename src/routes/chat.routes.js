import { Router } from 'express';
import { agentBrainService } from '../services/agentBrain.service.js';

const router = Router();

/**
 * POST /api/chat/changared
 * Asesor Comercial de Changared para aconsejar, explicar planes y vender la plataforma a visitantes.
 */
router.post('/changared', async (req, res, next) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'El campo message es requerido' });
    }

    const result = await agentBrainService.generateChangaredSalesReply(message, Array.isArray(history) ? history : []);
    return res.status(200).json({
      success: true,
      reply: result.reply,
      model: result.model,
      executionTimeMs: result.executionTimeMs,
      configured: result.configured,
    });
  } catch (error) {
    next(error);
  }
});

// Alias compatible
router.post('/advisor', async (req, res, next) => {
  try {
    const { message, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'El campo message es requerido' });
    }

    const result = await agentBrainService.generateChangaredSalesReply(message, Array.isArray(history) ? history : []);
    return res.status(200).json({
      success: true,
      reply: result.reply,
      model: result.model,
      executionTimeMs: result.executionTimeMs,
      configured: result.configured,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
