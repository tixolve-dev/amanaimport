// backend/src/modules/notifications/fcm.provider.js
'use strict';

const logger = require('../../config/logger');

/**
 * Firebase Cloud Messaging provider.
 * In Phase 1.7 we implement the interface and a no-op fallback.
 * Real FCM integration (admin SDK, topic subscriptions) lands when the
 * Flutter client is wired up. Never throws.
 */
async function sendPush({ token, title, body, data = {} }) {
  if (!process.env.FCM_SERVER_KEY && !process.env.FIREBASE_PROJECT_ID) {
    logger.debug(`[fcm] stub push → ${title}: ${body}`);
    return { skipped: true, reason: 'not_configured' };
  }
  // TODO when credentials provided:
  //   - initialize admin SDK
  //   - send via admin.messaging().send()
  logger.info(`[fcm] would push "${title}" (data=${JSON.stringify(data)})`);
  return { skipped: true, reason: 'implementation_pending' };
}

module.exports = { sendPush };