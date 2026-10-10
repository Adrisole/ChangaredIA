import { conversationRepository } from '../repositories/conversation.repository.js';
import { appointmentRepository } from '../repositories/appointment.repository.js';
import { businessRepository } from '../repositories/business.repository.js';

// Plazo de conservación declarado en la política de privacidad.
export const RETENTION_MONTHS = 24;
const DAY_MS = 24 * 60 * 60 * 1000;

export function retentionCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  return cutoff.toISOString();
}

/**
 * Borra los datos de clientes finales sin actividad en los últimos 24 meses:
 * conversaciones, turnos y pedidos. Los datos de la cuenta del comercio se
 * conservan hasta que el comercio elimine su cuenta.
 */
export async function runDataRetention(now = new Date()) {
  const cutoff = retentionCutoff(now);
  const conversations = await conversationRepository.deleteInactiveBefore(cutoff);
  const appointments = await appointmentRepository.deleteInactiveBefore(cutoff);

  let orders = 0;
  for (const business of await businessRepository.findAll()) {
    const list = Array.isArray(business.orders) ? business.orders : [];
    const kept = list.filter(order => (order.updatedAt || order.createdAt || '') >= cutoff);
    if (kept.length !== list.length) {
      orders += list.length - kept.length;
      await businessRepository.save({ ...business, orders: kept });
    }
  }

  console.log(`[Retención] Borrado por antigüedad (más de ${RETENTION_MONTHS} meses): ${conversations} conversaciones, ${appointments} turnos, ${orders} pedidos.`);
  return { conversations, appointments, orders };
}

/** Corre la limpieza un minuto después de arrancar y luego una vez por día. */
export function scheduleDataRetention() {
  const run = () => runDataRetention().catch(err => console.error('[Retención] Error en el borrado automático:', err.message));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, DAY_MS).unref();
}
