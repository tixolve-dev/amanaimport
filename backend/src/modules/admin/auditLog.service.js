// backend/src/modules/admin/auditLog.service.js
'use strict';

const { AuditLog } = require('./auditLog.model');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');
const logger = require('../../config/logger');

/**
 * Record a privileged action.
 * Never throws — logging failures must not break business flows.
 * Never includes sensitive values (passwords, tokens, full account numbers).
 */
async function record({ actorId, actorRole, action, targetType, targetId, summary = '', before = null, after = null, req = null }) {
  try {
    await AuditLog.create({
      actor: actorId,
      actorRole,
      action,
      targetType,
      targetId,
      summary,
      before: sanitizeSnapshot(before),
      after: sanitizeSnapshot(after),
      ip: req?.ip || null,
      requestId: req?.id || null,
    });
  } catch (err) {
    logger.error(`[audit] failed to record action=${action}: ${err.message}`);
  }
}

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'receiptKey', 'receiptUrl'];

function sanitizeSnapshot(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !(v instanceof Date)) {
      out[k] = sanitizeSnapshot(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function list(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.actor) filter.actor = query.actor;
  if (query.action) filter.action = query.action;
  if (query.targetType) filter.targetType = query.targetType;
  if (query.targetId) filter.targetId = query.targetId;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('actor', 'fullName email role'),
    AuditLog.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

module.exports = { record, list };