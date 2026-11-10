
'use strict';

const crypto = require('crypto');
const { v2: cloudinary } = require('cloudinary');
const env = require('../../config/env');
const ApiError = require('../../shared/utils/ApiError');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

const configured = Boolean(cloudName && apiKey && apiSecret);

if (configured) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

function ensureConfigured() {
  if (!configured) {
    throw new Error('Cloudinary credentials are not configured');
  }
}

function resourceTypeFromKey(key) {
  return /\.pdf$/i.test(key) ? 'raw' : 'image';
}

function validateKey(key) {
  if (
    !key ||
    typeof key !== 'string' ||
    key.startsWith('/') ||
    key.includes('..') ||
    key.includes('\\')
  ) {
    throw ApiError.badRequest('Invalid storage key');
  }
}

function sanitizeFolder(folder) {
  return String(folder || 'misc')
    .split('/')
    .map(part => part.replace(/[^a-z0-9_-]/gi, '_').toLowerCase())
    .filter(Boolean)
    .join('/');
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error('Cloudinary returned no upload result'));
        resolve(result);
      },
    );

    stream.end(buffer);
  });
}

const storage = {
  name: 'cloudinary',

  async put(buffer, {
    originalName,
    mimeType,
    folder = 'misc',
  }) {
    ensureConfigured();

    if (!Buffer.isBuffer(buffer)) {
      throw ApiError.badRequest('Upload buffer is required');
    }

    if (!ALLOWED_MIME.has(mimeType)) {
      throw ApiError.badRequest(`Unsupported file type: ${mimeType}`, {
        code: 'UNSUPPORTED_FILE_TYPE',
      });
    }

    const maxBytes = env.uploads.maxFileSizeMb * 1024 * 1024;

    if (buffer.length > maxBytes) {
      throw ApiError.badRequest(
        `File too large. Max ${env.uploads.maxFileSizeMb}MB`,
        { code: 'FILE_TOO_LARGE' },
      );
    }

    const safeFolder = sanitizeFolder(folder);
    const resourceType = mimeType === 'application/pdf' ? 'raw' : 'image';

    const uniqueName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}`;
    const publicId = resourceType === 'raw'
      ? `${uniqueName}.pdf`
      : uniqueName;

    try {
      const result = await uploadBuffer(buffer, {
        folder: safeFolder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: false,
        use_filename: false,
        unique_filename: false,
      });

      return {
        key: result.public_id,
        url: result.secure_url,
        size: result.bytes,
        mimeType,
        originalName,
        provider: 'cloudinary',
        resourceType,
      };
    } catch (error) {
      throw ApiError.internal(
        'File upload failed. Please try again.',
        { cause: error },
      );
    }
  },

  async exists(key) {
    ensureConfigured();
    validateKey(key);

    try {
      const resourceType = resourceTypeFromKey(key);

      await cloudinary.api.resource(key, {
        resource_type: resourceType,
        type: 'upload',
      });

      return true;
    } catch (error) {
      const status = error.http_code || error.statusCode;

      if (status === 404) return false;

      throw error;
    }
  },

  async delete(key) {
    ensureConfigured();
    validateKey(key);

    try {
      const resourceType = resourceTypeFromKey(key);

      await cloudinary.uploader.destroy(key, {
        resource_type: resourceType,
        type: 'upload',
        invalidate: true,
      });
    } catch (error) {
      throw error;
    }
  },
};

module.exports = {
  storage,
  ALLOWED_MIME,
  MIME_EXT,
};

