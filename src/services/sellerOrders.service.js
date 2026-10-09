import crypto from 'node:crypto';
import { businessRepository } from '../repositories/business.repository.js';
import { BusinessModel } from '../models/business.model.js';
import { isDbConnected } from '../config/database.js';
import { whatsappService } from './whatsapp.service.js';

const queues = new Map();

export const ORDER_STATUSES = Object.freeze({
  PENDING_INFORMATION: 'pending_information', PENDING_PAYMENT: 'pending_payment', PREPARING: 'preparing',
  READY_FOR_PICKUP: 'ready_for_pickup', SHIPPED: 'shipped', DELIVERED: 'delivered', CANCELLED: 'cancelled',
});
const TRANSITIONS = Object.freeze({
  pending_information: ['pending_payment', 'cancelled'], pending_payment: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'shipped'], ready_for_pickup: ['delivered'],
  shipped: ['delivered'], delivered: [], cancelled: [],
});
export function normalizedOrderStatus(status) { return status === 'confirmed' ? ORDER_STATUSES.PREPARING : status; }
export function canTransitionOrder(from, to) { return TRANSITIONS[normalizedOrderStatus(from)]?.includes(to) || false; }
async function serial(id, task) {
  const previous = queues.get(id) || Promise.resolve(); const running = previous.catch(() => {}).then(task);
  queues.set(id, running); try { return await running; } finally { if (queues.get(id) === running) queues.delete(id); }
}
function cleanText(value, maxLength = 280) { return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''; }
function normalizeDetails(raw = {}) {
  const fulfillmentMethod = ['delivery', 'pickup'].includes(raw.fulfillmentMethod) ? raw.fulfillmentMethod : 'unspecified';
  const cost = Number(raw.deliveryCost);
  return { customerName: cleanText(raw.customerName, 100), fulfillmentMethod, deliveryAddress: fulfillmentMethod === 'delivery' ? cleanText(raw.deliveryAddress, 280) : '', deliveryCost: fulfillmentMethod === 'delivery' && Number.isFinite(cost) && cost >= 0 ? cost : 0, customerNote: cleanText(raw.customerNote, 500) };
}
function missingDetails(order) {
  const missing = []; if (!order.customerName) missing.push('nombre del cliente');
  if (order.fulfillmentMethod === 'unspecified') missing.push('retiro o entrega');
  if (order.fulfillmentMethod === 'delivery' && !order.deliveryAddress) missing.push('dirección de entrega');
  return missing;
}
function statusRecord(status, at, by = 'system') { return { status, at, by }; }

export class SellerOrdersService {
  async persistOrder(business, order) {
    if (isDbConnected()) {
      await BusinessModel.updateOne({ id: business.id, 'orders.id': order.id }, { $set: { 'orders.$': order } });
    } else {
      const latest = await businessRepository.findById(business.id);
      if (!latest) throw new Error('Negocio inexistente.');
      await businessRepository.save({ ...latest, orders: (latest.orders || []).map((item) => item.id === order.id ? order : item) });
    }
  }
  async saveNotifications(business, order, notifications) { await this.persistOrder(business, { ...order, notifications }); }
  async notify(business, order, event = 'created') {
    const action = { created: 'Nuevo pedido', payment_confirmed: 'Pago confirmado', status_changed: 'Pedido actualizado' }[event] || 'Pedido actualizado';
    const text = `${action} #${order.id}: ${order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}. Total $${order.total}. Cliente: ${order.customerName || order.customerPhone}. Estado: ${order.status}.`;
    const delivery = { event, attemptedAt: new Date().toISOString() };
    for (const [key, to] of [['owner', business.notificationPhone], ['customer', event !== 'created' ? order.customerPhone : '']]) {
      if (!to) continue;
      try { const result = await whatsappService.sendTextMessage({ business, to, text }); delivery[key] = result.simulated ? 'not_connected' : result.sent ? 'sent' : 'failed'; } catch { delivery[key] = 'failed'; }
    }
    return delivery;
  }

  async create(businessId, customerPhone, items, sourceId, details = {}) {
    return serial(businessId, async () => {
      const business = await businessRepository.findById(businessId); if (!business) throw new Error('Negocio inexistente.');
      const orders = business.orders || []; const duplicate = sourceId && orders.find((order) => order.sourceId === sourceId); if (duplicate) return duplicate;
      if (!Array.isArray(items) || !items.length || items.length > 30) throw new Error('El pedido necesita productos.');
      const quantities = new Map();
      for (const item of items) { if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('Cantidad inválida.'); quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity); }
      const lines = [...quantities].map(([id, quantity]) => {
        const product = business.catalog?.find((item) => item.id === id); if (!product || product.stock < quantity) throw new Error('No hay stock suficiente para ese pedido.');
        return { productId: id, name: product.name, quantity, price: product.price };
      });
      const normalizedDetails = normalizeDetails(details); const subtotal = lines.reduce((sum, item) => sum + item.price * item.quantity, 0); const missing = missingDetails(normalizedDetails); const now = new Date().toISOString();
      const status = missing.length ? ORDER_STATUSES.PENDING_INFORMATION : ORDER_STATUSES.PENDING_PAYMENT;
      const order = { id: crypto.randomUUID(), sourceId, customerPhone, items: lines, subtotal, deliveryCost: normalizedDetails.deliveryCost, total: subtotal + normalizedDetails.deliveryCost, ...normalizedDetails, missingDetails: missing, stockReserved: false, status, createdAt: now, updatedAt: now, statusHistory: [statusRecord(status, now)] };
      if (isDbConnected()) await BusinessModel.updateOne({ id: businessId }, { $push: { orders: order } }); else await businessRepository.save({ ...business, orders: [...orders, order] });
      order.notifications = await this.notify(business, order, 'created'); await this.saveNotifications(business, order, order.notifications); return order;
    });
  }

  async updateDetails(businessId, orderId, details) {
    return serial(businessId, async () => {
      const business = await businessRepository.findById(businessId); const current = business?.orders?.find((item) => item.id === orderId); if (!current) throw new Error('Pedido inexistente.');
      const currentStatus = normalizedOrderStatus(current.status); if ([ORDER_STATUSES.DELIVERED, ORDER_STATUSES.CANCELLED].includes(currentStatus)) throw new Error('No se puede editar un pedido finalizado.');
      const patch = normalizeDetails({ ...current, ...details }); const subtotal = Number.isFinite(current.subtotal) ? current.subtotal : current.total - (current.deliveryCost || 0); const now = new Date().toISOString();
      const updated = { ...current, ...patch, subtotal, total: subtotal + patch.deliveryCost, updatedAt: now }; updated.missingDetails = missingDetails(updated);
      updated.status = currentStatus; updated.statusHistory = current.statusHistory || [statusRecord(currentStatus, current.createdAt)];
      if (currentStatus === ORDER_STATUSES.PENDING_INFORMATION && !updated.missingDetails.length) { updated.status = ORDER_STATUSES.PENDING_PAYMENT; updated.statusHistory = [...updated.statusHistory, statusRecord(updated.status, now, 'owner')]; }
      await this.persistOrder(business, updated); return updated;
    });
  }

  async confirm(businessId, orderId) {
    return serial(businessId, async () => {
      const business = await businessRepository.findById(businessId); const order = business?.orders?.find((item) => item.id === orderId); if (!order) throw new Error('Pedido inexistente.');
      const currentStatus = normalizedOrderStatus(order.status); if (currentStatus === ORDER_STATUSES.PREPARING) return { ...order, status: ORDER_STATUSES.PREPARING, alreadyConfirmed: true };
      if (currentStatus !== ORDER_STATUSES.PENDING_PAYMENT) throw new Error('Completá los datos del pedido antes de confirmar el pago.');
      const catalog = structuredClone(business.catalog || []);
      for (const item of order.items) { const product = catalog.find((entry) => entry.id === item.productId); if (!product || product.stock < item.quantity) throw new Error('Stock insuficiente. No se confirmó ni descontó el pedido.'); product.stock -= item.quantity; }
      const now = new Date().toISOString(); const confirmed = { ...order, status: ORDER_STATUSES.PREPARING, stockReserved: true, confirmedAt: now, updatedAt: now, paymentVerification: 'owner_manual', missingDetails: [], statusHistory: [...(order.statusHistory || [statusRecord(currentStatus, order.createdAt)]), statusRecord(ORDER_STATUSES.PREPARING, now, 'owner')] };
      if (isDbConnected()) {
        const conditions = order.items.map((item) => ({ catalog: { $elemMatch: { id: item.productId, stock: { $gte: item.quantity } } } })); const increments = Object.fromEntries(order.items.map((item, index) => [`catalog.$[p${index}].stock`, -item.quantity]));
        const result = await BusinessModel.updateOne({ id: businessId, orders: { $elemMatch: { id: orderId, status: ORDER_STATUSES.PENDING_PAYMENT } }, $and: conditions }, { $inc: increments, $set: { 'orders.$': confirmed } }, { arrayFilters: order.items.map((item, index) => ({ [`p${index}.id`]: item.productId })) });
        if (!result.modifiedCount) throw new Error('El pedido o el stock cambiaron. Actualizá la lista.');
      } else await businessRepository.save({ ...business, catalog, orders: business.orders.map((item) => item.id === orderId ? confirmed : item) });
      confirmed.notifications = await this.notify(business, confirmed, 'payment_confirmed'); await this.saveNotifications(business, confirmed, confirmed.notifications); return confirmed;
    });
  }

  async updateStatus(businessId, orderId, nextStatus) {
    return serial(businessId, async () => {
      const business = await businessRepository.findById(businessId); const order = business?.orders?.find((item) => item.id === orderId); if (!order) throw new Error('Pedido inexistente.');
      const currentStatus = normalizedOrderStatus(order.status); if (!Object.values(ORDER_STATUSES).includes(nextStatus) || !canTransitionOrder(currentStatus, nextStatus)) throw new Error('Ese cambio de estado no está permitido para este pedido.');
      const now = new Date().toISOString(); const updated = { ...order, status: nextStatus, updatedAt: now, statusHistory: [...(order.statusHistory || [statusRecord(currentStatus, order.createdAt)]), statusRecord(nextStatus, now, 'owner')] };
      await this.persistOrder(business, updated); updated.notifications = await this.notify(business, updated, 'status_changed'); await this.saveNotifications(business, updated, updated.notifications); return updated;
    });
  }
}
export const sellerOrdersService = new SellerOrdersService();
