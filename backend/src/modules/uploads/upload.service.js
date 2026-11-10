// backend/src/modules/uploads/upload.service.js
'use strict';

const { storage } = require('./storage.provider');
const ApiError = require('../../shared/utils/ApiError');

const FOLDER_RULES = {
  'verification': ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  'request-reference': ['image/jpeg', 'image/png', 'image/webp'],
  'request-attachment': ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  'quotation-attachment': ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  'payment-receipt': ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  'dispute-evidence': ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  'shipment-proof': ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  'avatar': ['image/jpeg', 'image/png', 'image/webp'],
};

async function uploadFile({ file, folder, userId }) {
  if (!FOLDER_RULES[folder]) {
    throw ApiError.badRequest(`Unknown upload folder: ${folder}`, { code: 'UNKNOWN_FOLDER' });
  }
  const allowed = FOLDER_RULES[folder];
  if (!allowed.includes(file.mimetype)) {
    throw ApiError.badRequest(
      `File type ${file.mimetype} not allowed for ${folder}`,
      { code: 'UNSUPPORTED_FILE_TYPE' },
    );
  }
  const result = await storage.put(file.buffer, {
    originalName: file.originalname,
    mimeType: file.mimetype,
    folder: `${folder}/${userId}`,
  });
  return result;
}

async function deleteFile(key, userId) {
  // Ownership check: folder must include the userId
  if (!key.includes(`/${userId}/`)) {
    throw ApiError.forbidden('You cannot delete this file');
  }
  await storage.delete(key);
}

module.exports = { uploadFile, deleteFile, FOLDER_RULES };