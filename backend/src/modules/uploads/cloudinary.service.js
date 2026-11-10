// backend/src/modules/uploads/cloudinary.service.js
'use strict';

const { v2: cloudinary } = require('cloudinary');
const ApiError = require('../../shared/utils/ApiError');

const RECEIPT_FOLDER = 'ethiomarket/receipts';
const DELIVERY_TYPES = ['upload', 'authenticated'];

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
const canCallApi = Boolean(cloudName && apiKey && apiSecret);

if (canCallApi) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
}

const toMime = (format) => `image/${format === 'jpg' ? 'jpeg' : format || 'jpeg'}`;

/**
 * Confirms a receipt really exists in OUR Cloudinary account and returns trusted
 * values (never trust the URL the client sends).
 */
async function verifyReceipt({ key, url, deliveryType = 'upload' }) {
  if (!key || !key.startsWith(`${RECEIPT_FOLDER}/`)) {
    throw ApiError.badRequest('Invalid receipt reference');
  }
  if (!DELIVERY_TYPES.includes(deliveryType)) {
    throw ApiError.badRequest('Invalid receipt delivery type');
  }

  if (canCallApi) {
    try {
      const r = await cloudinary.api.resource(key, { type: deliveryType, resource_type: 'image' });
      return { key: r.public_id, url: r.secure_url, mimeType: toMime(r.format), deliveryType: r.type };
    } catch (_err) {
      throw ApiError.badRequest('Receipt file not found');
    }
  }

  // No API credentials configured: only accept URLs inside our own cloud.
  if (!cloudName || !String(url || '').startsWith(`https://res.cloudinary.com/${cloudName}/`)) {
    throw ApiError.badRequest('Receipt URL is not from our storage');
  }
  return { key, url, mimeType: 'image/jpeg', deliveryType };
}

/** URL the admin (or buyer) can open. Signed when the asset is "authenticated". */
function receiptViewUrl(record) {
  if (!record || !record.receiptUrl) return null;
  if (record.receiptProvider !== 'cloudinary') return record.receiptUrl;
  if (record.receiptDeliveryType !== 'authenticated' || !canCallApi) return record.receiptUrl;
  return cloudinary.url(record.receiptKey, {
    type: 'authenticated', sign_url: true, secure: true, resource_type: 'image',
  });
}

module.exports = { verifyReceipt, receiptViewUrl, RECEIPT_FOLDER };
