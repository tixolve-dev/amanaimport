// backend/src/modules/notifications/notification.service.js
'use strict';

const { Notification, NOTIFICATION_TYPE } = require('./notification.model');
const { User } = require('../users/user.model');
const fcm = require('./fcm.provider');
const logger = require('../../config/logger');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');

/**
 * Create a persisted notification. This is the ONLY way notifications are emitted.
 * Prompt §13.13: notifications must correspond to real persisted events.
 * Callers MUST pass `event: { type, targetId }` referencing an actual domain
 * object that already exists in the DB.
 */
async function notify({ recipientId, type, title, body, data = {}, event }) {
  if (!event || !event.type || !event.targetId) {
    throw new Error('notify() requires event { type, targetId }');
  }
  const doc = await Notification.create({
    recipient: recipientId,
    type,
    title,
    body,
    data,
    event,
  });

  // Best-effort push (never blocks or throws)
  try {
    const user = await User.findById(recipientId).select('fcmToken');
    if (user?.fcmToken) {
      await fcm.sendPush({
        token: user.fcmToken, title, body, data: { ...data, notificationId: doc._id.toString() },
      });
    }
  } catch (err) {
    logger.warn(`[notify] push failed: ${err.message}`);
  }

  return doc;
}

async function listForUser(userId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { recipient: userId };
  if (query.unreadOnly === 'true') filter.readAt = null;

  const [items, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
  ]);
  const unreadCount = await Notification.countDocuments({ recipient: userId, readAt: null });
  return { items, meta: { ...buildPaginationMeta({ page, limit, total }), unreadCount } };
}

async function markRead(userId, notificationId) {
  const res = await Notification.updateOne(
    { _id: notificationId, recipient: userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return res.modifiedCount > 0;
}

async function markAllRead(userId) {
  const res = await Notification.updateMany(
    { recipient: userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return res.modifiedCount;
}

module.exports = {
  notify,
  listForUser,
  markRead,
  markAllRead,
  NOTIFICATION_TYPE,
};