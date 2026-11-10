// backend/src/modules/notifications/notification.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./notification.service');

async function listMine(req, res, next) {
  try {
    const { items, meta } = await service.listForUser(req.user.id, req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function markRead(req, res, next) {
  try {
    const ok = await service.markRead(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found or already read' } });
    return res.status(200).json(ApiResponse.ok(null, 'Marked read'));
  } catch (err) { return next(err); }
}

async function markAllRead(req, res, next) {
  try {
    const count = await service.markAllRead(req.user.id);
    return res.status(200).json(ApiResponse.ok({ count }, 'Marked all read'));
  } catch (err) { return next(err); }
}

module.exports = { listMine, markRead, markAllRead };