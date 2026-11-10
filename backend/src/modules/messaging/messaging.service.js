// backend/src/modules/messaging/messaging.service.js
'use strict';

const { Conversation } = require('./conversation.model');
const { Message } = require('./message.model');
const { Order } = require('../orders/order.model');
const { ROLES } = require('../../shared/constants/roles');
const notificationService = require('../notifications/notification.service');
const { NOTIFICATION_TYPE } = require('../notifications/notification.model');
const ApiError = require('../../shared/utils/ApiError');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');

async function getOrCreateForOrder(order) {
  let convo = await Conversation.findOne({ order: order._id });
  if (!convo) {
    convo = await Conversation.create({
      order: order._id,
      buyer: order.buyer,
      importer: order.importerUser,
    });
  }
  return convo;
}

async function listMyConversations(userId) {
  const conversations = await Conversation.find({
    $or: [{ buyer: userId }, { importer: userId }],
  }).sort({ lastMessageAt: -1, createdAt: -1 })
    .populate('buyer', 'fullName')
    .populate('importer', 'fullName')
    .populate('order', 'referenceNumber status snapshot');
  return conversations;
}

async function getConversationForUser(userId, conversationId) {
  const convo = await Conversation.findById(conversationId)
    .populate('buyer', 'fullName')
    .populate('importer', 'fullName')
    .populate('order', 'referenceNumber status');
  if (!convo) throw ApiError.notFound('Conversation not found');
  const isBuyer = convo.buyer._id.toString() === userId.toString();
  const isImporter = convo.importer._id.toString() === userId.toString();
  if (!isBuyer && !isImporter) throw ApiError.forbidden('Not a participant');
  return convo;
}

async function listMessages(userId, conversationId, query) {
  const convo = await Conversation.findById(conversationId);
  if (!convo) throw ApiError.notFound('Conversation not found');
  const isBuyer = convo.buyer.toString() === userId.toString();
  const isImporter = convo.importer.toString() === userId.toString();
  if (!isBuyer && !isImporter) throw ApiError.forbidden('Not a participant');

  const { page, limit, skip } = parsePagination(query);
  const [items, total] = await Promise.all([
    Message.find({ conversation: conversationId })
      .sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('sender', 'fullName role'),
    Message.countDocuments({ conversation: conversationId }),
  ]);

  // Reset unread
  const field = isBuyer ? 'buyerUnreadCount' : 'importerUnreadCount';
  await Conversation.updateOne({ _id: conversationId }, { $set: { [field]: 0 } });

  return { items: items.reverse(), meta: buildPaginationMeta({ page, limit, total }) };
}

async function sendMessage(userId, role, conversationId, body) {
  const convo = await Conversation.findById(conversationId);
  if (!convo) throw ApiError.notFound('Conversation not found');
  const isBuyer = convo.buyer.toString() === userId.toString();
  const isImporter = convo.importer.toString() === userId.toString();
  if (!isBuyer && !isImporter) throw ApiError.forbidden('Not a participant');

  const msg = await Message.create({
    conversation: conversationId,
    sender: userId,
    senderRole: role,
    body,
  });

  const preview = body.length > 100 ? `${body.slice(0, 100)}…` : body;
  const otherField = isBuyer ? 'importerUnreadCount' : 'buyerUnreadCount';
  await Conversation.updateOne(
    { _id: conversationId },
    {
      $set: { lastMessageAt: new Date(), lastMessagePreview: preview },
      $inc: { [otherField]: 1 },
    },
  );

  // Notify recipient
  const recipient = isBuyer ? convo.importer : convo.buyer;
  await notificationService.notify({
    recipientId: recipient,
    type: NOTIFICATION_TYPE.SYSTEM,
    title: 'New message',
    body: preview,
    data: { conversationId: conversationId.toString() },
    event: { type: 'Message', targetId: msg._id },
  });

  return msg;
}

async function adminGetForOrder(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  const convo = await getOrCreateForOrder(order);
  const messages = await Message.find({ conversation: convo._id })
    .sort({ createdAt: 1 }).limit(500)
    .populate('sender', 'fullName role');
  return { conversation: convo, messages };
}

/**
 * Admin posts a message into an order's conversation.
 * - Uses the same Conversation as buyer ↔ importer.
 * - Sender role is 'admin' so mobile can style it distinctly.
 * - Persists a notification to both parties.
 * - Never impersonates the buyer or importer.
 */
async function adminSendMessage(adminId, orderId, body) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  const convo = await getOrCreateForOrder(order);

  const msg = await Message.create({
    conversation: convo._id,
    sender: adminId,
    senderRole: ROLES.ADMIN,
    body,
  });

  const preview = body.length > 100 ? `${body.slice(0, 100)}…` : body;
  await Conversation.updateOne(
    { _id: convo._id },
    {
      $set: { lastMessageAt: new Date(), lastMessagePreview: `[Admin] ${preview}` },
      $inc: { buyerUnreadCount: 1, importerUnreadCount: 1 },
    },
  );

  // Notify both parties
  const notifyService = require('../notifications/notification.service');
  const { NOTIFICATION_TYPE } = require('../notifications/notification.model');
  for (const recipient of [order.buyer, order.importerUser]) {
    await notifyService.notify({
      recipientId: recipient,
      type: NOTIFICATION_TYPE.SYSTEM,
      title: 'Message from EthioMarket',
      body: preview,
      data: {
        conversationId: convo._id.toString(),
        orderId: orderId.toString(),
      },
      event: { type: 'Message', targetId: msg._id },
    });
  }

  return msg;
}

module.exports = {
  getOrCreateForOrder,
  listMyConversations,
  getConversationForUser,
  listMessages,
  sendMessage,
  adminGetForOrder,
  adminSendMessage,
};