// backend/src/config/env.js
'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Load .env from backend root regardless of cwd
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Small helper — read an env var and throw if missing (or return default).
 * @param {string} key
 * @param {object} [opts]
 * @param {string} [opts.defaultValue]
 * @param {boolean} [opts.required=true]
 * @param {'string'|'number'|'boolean'} [opts.type='string']
 * @returns {any}
 */
function readEnv(key, opts = {}) {
  const { defaultValue, required = true, type = 'string' } = opts;
  let value = process.env[key];

  if (value === undefined || value === '') {
    if (defaultValue !== undefined) return defaultValue;
    if (required) {
      throw new Error(`[env] Missing required environment variable: ${key}`);
    }
    return undefined;
  }

  switch (type) {
    case 'number': {
      const n = Number(value);
      if (Number.isNaN(n)) {
        throw new Error(`[env] Environment variable ${key} must be a number, got "${value}"`);
      }
      return n;
    }
    case 'boolean':
      return value === 'true' || value === '1';
    default:
      return value;
  }
}

// Node environment
const NODE_ENV = readEnv('NODE_ENV', { defaultValue: 'development' });
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

// JWT secrets — must NOT be the defaults in production
const jwtSecret = readEnv('JWT_ACCESS_SECRET', {
  defaultValue: isProd ? undefined : 'dev-access-secret-change-me',
  required: isProd,
});
const jwtRefreshSecret = readEnv('JWT_REFRESH_SECRET', {
  defaultValue: isProd ? undefined : 'dev-refresh-secret-change-me',
  required: isProd,
});

if (isProd) {
  const weak = ['dev-access-secret-change-me', 'dev-refresh-secret-change-me'];
  if (weak.includes(jwtSecret) || weak.includes(jwtRefreshSecret)) {
    throw new Error('[env] Refusing to start in production with development JWT secrets.');
  }
  if (jwtSecret.length < 32 || jwtRefreshSecret.length < 32) {
    throw new Error('[env] Production JWT secrets must be at least 32 characters.');
  }
}

const env = Object.freeze({
  nodeEnv: NODE_ENV,
  isProd,
  isDev: NODE_ENV === 'development',
  isTest,

  port: readEnv('PORT', { type: 'number', defaultValue: 5000 }),
  apiPrefix: readEnv('API_PREFIX', { defaultValue: '/api/v1' }),

  mongoUri: readEnv('MONGO_URI', {
    defaultValue: isProd ? undefined : 'mongodb://127.0.0.1:27017/ethio_marketplace',
    required: isProd,
  }),

  jwt: {
    accessSecret: jwtSecret,
    refreshSecret: jwtRefreshSecret,
    accessExpiresIn: readEnv('JWT_ACCESS_EXPIRES_IN', { defaultValue: '15m' }),
    refreshExpiresIn: readEnv('JWT_REFRESH_EXPIRES_IN', { defaultValue: '7d' }),
  },

  cors: {
    // comma-separated list in env, e.g. CORS_ORIGINS=https://a.com,https://b.com
    origins: (readEnv('CORS_ORIGINS', { defaultValue: '*' }) || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  rateLimit: {
    windowMs: readEnv('RATE_LIMIT_WINDOW_MS', { type: 'number', defaultValue: 15 * 60 * 1000 }),
    max: readEnv('RATE_LIMIT_MAX', { type: 'number', defaultValue: 300 }),
  },

  logLevel: readEnv('LOG_LEVEL', { defaultValue: isTest ? 'error' : 'info' }),

    manualPayment: {
    channel: readEnv('MANUAL_PAY_CHANNEL', { defaultValue: 'bank_transfer' }),
    recipientName: readEnv('MANUAL_PAY_RECIPIENT_NAME', { defaultValue: 'Ethio Marketplace PLC' }),
    accountNumber: readEnv('MANUAL_PAY_ACCOUNT', { required: false, defaultValue: null }),
    bankName: readEnv('MANUAL_PAY_BANK', { required: false, defaultValue: null }),
  },
  
  uploads: {
    dir: readEnv('UPLOAD_DIR', { defaultValue: 'uploads' }),
    maxFileSizeMb: readEnv('UPLOAD_MAX_MB', { type: 'number', defaultValue: 10 }),
  },
});

module.exports = env;