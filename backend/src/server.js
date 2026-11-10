// backend/src/server.js
'use strict';

const http = require('http');
const env = require('./config/env');
const logger = require('./config/logger');
const { connect, disconnect } = require('./config/database');
const buildApp = require('./app');

let server = null;
let isShuttingDown = false;

async function start() {
  try {
    // 1. Connect to MongoDB first
    await connect();

    // 2. Build app
    const app = buildApp();

    // 3. Start HTTP server
    
    // 3. Start HTTP server and allow LAN connections from the phone
    server = http.createServer(app);

    server.on('error', (err) => {
      logger.error(`[server] HTTP server error: ${err.message}`);
      shutdown('server-error', 1);
    });

    server.listen(env.port, '0.0.0.0', () => {
      logger.info(
        `[server] Listening on http://0.0.0.0:${env.port} ` +
        `(env=${env.nodeEnv}, api=${env.apiPrefix})`,
      );
      logger.info(`[server] Local health: http://localhost:${env.port}/health`);
      logger.info(`[server] API v1 health: http://localhost:${env.port}${env.apiPrefix}/health`);
    });

  } catch (err) {
    logger.error(`[server] Failed to start: ${err.message}`);
    process.exit(1);
  }
}

async function shutdown(reason, exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`[server] Shutting down (${reason})…`);

  const forceExitTimer = setTimeout(() => {
    logger.error('[server] Forced exit after 15s.');
    process.exit(exitCode || 1);
  }, 15_000);
  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info('[server] HTTP server closed.');
    }
    await disconnect();
    logger.info('[server] Shutdown complete.');
    process.exit(exitCode);
  } catch (err) {
    logger.error(`[server] Error during shutdown: ${err.message}`);
    process.exit(1);
  }
}

// ---- Process-level safety nets ----------------------------------------
process.on('unhandledRejection', (reason) => {
  logger.error(`[process] Unhandled promise rejection: ${reason instanceof Error ? reason.message : reason}`);
  // Do NOT exit here in dev — but do flag it
});

process.on('uncaughtException', (err) => {
  logger.error(`[process] Uncaught exception: ${err.message}`, { stack: err.stack });
  // Uncaught exceptions leave process in unknown state — exit gracefully
  shutdown('uncaught-exception', 1);
});

process.once('SIGINT', () => shutdown('SIGINT', 0));
process.once('SIGTERM', () => shutdown('SIGTERM', 0));

// ---- Start -------------------------------------------------------------
if (require.main === module) {
  start();
}

module.exports = { start, shutdown };