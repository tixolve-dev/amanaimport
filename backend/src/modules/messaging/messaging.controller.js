// backend/src/modules/messaging/messaging.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./messaging.service');

async function listMine(req, res, next) {
  try {
    const list = await service.listMyConversations(req.user.id);
    return res.status(200).json(ApiResponse.ok(list));
  } catch (err) { return next(err); }
}

async function get(req, res, next) {
  try {
    const convo = await service.getConversationForUser(req.user.id, req.params.id);
    return res.status(200).json(ApiResponse.ok(convo));
  } catch (err) { return next(err); }
}

async function listMessages(req, res, next) {
  try {
    const { items, meta } = await service.listMessages(req.user.id, req.params.id, req.query);
    return res.status(200).json(ApiResponse.paginated(items, meta));
  } catch (err) { return next(err); }
}

async function send(req, res, next) {
  try {
    const msg = await service.sendMessage(
      req.user.id, req.user.role, req.params.id, req.body.body,
    );
    return res.status(201).json(ApiResponse.created(msg, 'Message sent'));
  } catch (err) { return next(err); }
}

async function adminSend(req, res, next) {
  try {
    const msg = await service.adminSendMessage(
      req.user.id,
      req.params.orderId,
      req.body.body,
    );
    return res.status(201).json(ApiResponse.created(msg, 'Message sent'));
  } catch (err) { return next(err); }
}

module.exports = { listMine, get, listMessages, send ,adminSend};