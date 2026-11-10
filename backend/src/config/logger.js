// backend/src/config/logger.js
'use strict';

const fs = require('fs');
const path = require('path');
const winston = require('winston');
const env = require('./env');

const logDir = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Redact common sensitive keys from log metadata
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'newPassword',
  'oldPassword',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'secret',
  'apiKey',
  'jwt',
];

function redactSensitive(info) {
  const walk = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 6) return obj;
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        walk(obj[key], depth + 1);
      }
    }
    return obj;
  };
  return walk({ ...info });
}

const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format(redactSensitive)(),
);

const consoleFormat = winston.format.combine(
  baseFormat,
  winston.format.colorize({ all: env.isDev }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}${stack ? `\n${stack}` : ''}`;
  }),
);

const fileFormat = winston.format.combine(baseFormat, winston.format.json());

const transports = [
  new winston.transports.Console({
    format: consoleFormat,
    level: env.logLevel,
    silent: env.isTest,
  }),
];

if (!env.isTest) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
      tailable: true,
    }),
  );
}

const logger = winston.createLogger({
  level: env.logLevel,
  levels: winston.config.npm.levels,
  defaultMeta: { service: 'ethio-marketplace-api' },
  transports,
  exitOnError: false,
});

// Stream for morgan HTTP logging
logger.stream = {
  write: (message) => logger.info(message.trim()),
};

module.exports = logger;