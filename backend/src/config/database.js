
'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

function safeUri(uri) {
  try {
    return uri.replace(
      /(mongodb(?:\+srv)?:\/\/[^:]+:)[^@]+@/,
      '$1****@',
    );
  } catch {
    return '[unparseable-uri]';
  }
}

mongoose.set('strictQuery', true);

async function connect({ maxRetries = 5, retryDelayMs = 3000 } = {}) {
  const uri = env.mongoUri;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(uri, {
        autoIndex: !env.isProd,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 20,
        minPoolSize: 2,
      });

      logger.info(
        `[db] MongoDB connected (db=${mongoose.connection.name})`,
      );

      return mongoose.connection;
    } catch (err) {
      logger.error(
        `[db] Connection failed (${attempt}/${maxRetries}): ${err.message}`,
      );

      if (attempt === maxRetries) {
        throw err;
      }

      const delay = retryDelayMs * attempt;

      logger.info(`[db] Retrying in ${delay}ms...`);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function disconnect() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('[db] MongoDB disconnected.');
  }
}

mongoose.connection.on('connected', () => {
  logger.info('[db] Event: connected');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('[db] Event: disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('[db] Event: reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error(`[db] Event: ${err.message}`);
});

module.exports = {
  connect,
  disconnect,
  mongoose,
};
