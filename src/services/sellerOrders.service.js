import crypto from 'node:crypto';
import { businessRepository } from '../repositories/business.repository.js';
import { BusinessModel } from '../models/business.model.js';
import { isDbConnected } from '../config/database.js';
import { whatsappService } from './whatsapp.service.js';

const queues = new Map();
async function serial(id, task) {
  const previous = queues.get(id) || Promise.resolve();
  const running = previous.catch(() => {}).then(task);
  queues.set(id, running);
  try { return await running; } finally { if (queues.get(id) === running) queues.delete(id); }
}

export class SellerOrdersService {
  async saveNotifications(businessId, orderId, notifications) {
    if (isDbConnected()) {
      await BusinessModel.updateOne({ id: businessId, 'orders.id': orderId }, { $set: { 'orders.$.notifications': notifications } });
    } else {
      const business = await businessRepository.findById(businessId);
      await businessRepository.save({ ...business, orders: business.orders.map(o => o.id === orderId ? { ...o, notifications } : o) });
    }
  }
  async notify(business, order, confirmed = false) {
    const text = `${confirmed ? 'Compra confirmada' : 'Nuevo pedido pendiente de pago'} #${order.id}: ${order.items.map(i => `${i.quantity} × ${i.name}`).join(', ')}. Total $${order.total}. Cliente: ${order.customerPhone}.`;
    const delivery = {};
    for (const [key, to] of [['owner', business.notificationPhone], ['customer', confirmed ? order.customerPhone : '']]) {
      if (!to) continue;
      try {
        const result = await whatsappService.sendTextMessage({ business, to, text });
        delivery[key] = result.simulated ? 'not_connected' : result.sent ? 'sent' : 'failed';
      } catch { delivery[key] = 'failed'; }
    }
    return delivery;
  }

  async create(businessId, customerPhone, items, sourceId) {
    return serial(businessId, async () => {
      const business = await businessRepository.findById(businessId);
      if (!business) throw new Error('Negocio inexistente.');
      const orders = business.orders || [];
      const duplicate = sourceId && orders.find(o => o.sourceId === sourceId);
      if (duplicate) return duplicate;
      if (!Array.isArray(items) || !items.length || items.length > 30) throw new Error('El pedido necesita productos.');
      const quantities = new Map();
      for (const item of items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('Cantidad inválida.');
        quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
      }
      const lines = [...quantities].map(([id, quantity]) => {
        const product = business.catalog?.find(p => p.id === id);
        if (!product || product.stock < quantity) throw new Error('No hay stock suficiente para ese pedido.');
        return { productId: id, name: product.name, quantity, price: product.price };
      });
      const order = { id: crypto.randomUUID(), sourceId, customerPhone, items: lines, total: lines.reduce((sum, i) => sum + i.price * i.quantity, 0), status: 'pending_payment', createdAt: new Date().toISOString() };
      if (isDbConnected()) {
        await BusinessModel.updateOne({ id: businessId }, { $push: { orders: order } });
      } else {
        await businessRepository.save({ ...business, orders: [...orders, order] });
      }
      order.notifications = await this.notify(business, order);
      await this.saveNotifications(businessId, order.id, order.notifications);
      return order;
    });
  }

  async confirm(businessId, orderId) {
    return serial(businessId, async () => {
      const business = await businessRepository.findById(businessId);
      const order = business?.orders?.find(o => o.id === orderId);
      if (!order) throw new Error('Pedido inexistente.');
      if (order.status === 'confirmed') return { ...order, alreadyConfirmed: true };
      const catalog = structuredClone(business.catalog || []);
      for (const item of order.items) {
        const product = catalog.find(p => p.id === item.productId);
        if (!product || product.stock < item.quantity) throw new Error('Stock insuficiente. No se confirmó ni descontó el pedido.');
        product.stock -= item.quantity;
      }
      const confirmed = { ...order, status: 'confirmed', confirmedAt: new Date().toISOString(), paymentVerification: 'owner_manual' };
      if (isDbConnected()) {
        const conditions = order.items.map(i => ({ catalog: { $elemMatch: { id: i.productId, stock: { $gte: i.quantity } } } }));
        const increments = Object.fromEntries(order.items.map((i, n) => [`catalog.$[p${n}].stock`, -i.quantity]));
        const updated = await BusinessModel.updateOne({ id: businessId, orders: { $elemMatch: { id: orderId, status: 'pending_payment' } }, $and: conditions }, { $inc: increments, $set: { 'orders.$[order].status': 'confirmed', 'orders.$[order].confirmedAt': confirmed.confirmedAt, 'orders.$[order].paymentVerification': 'owner_manual' } }, { arrayFilters: [{ 'order.id': orderId }, ...order.items.map((i, n) => ({ [`p${n}.id`]: i.productId }))] });
        if (!updated.modifiedCount) throw new Error('El pedido o el stock cambiaron. Actualizá la lista.');
      } else {
        await businessRepository.save({ ...business, catalog, orders: business.orders.map(o => o.id === orderId ? confirmed : o) });
      }
      confirmed.notifications = await this.notify(business, confirmed, true);
      await this.saveNotifications(businessId, order.id, confirmed.notifications);
      return confirmed;
    });
  }
}
export const sellerOrdersService = new SellerOrdersService();
