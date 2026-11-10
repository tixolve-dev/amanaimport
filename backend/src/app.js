'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const env = require('./config/env');
const logger = require('./config/logger');
const {
  errorHandler,
  notFoundHandler,
} = require('./shared/middleware/errorHandler');

function buildApp() {
  const app = express();

  // ---- Trust proxy ------------------------------------------------------
  // Required when deployed behind a trusted reverse proxy.
  app.set('trust proxy', 1);

  // ---- Request ID -------------------------------------------------------
  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];

    req.id =
      typeof incoming === 'string' && incoming.length <= 100
        ? incoming
        : crypto.randomUUID();

    res.setHeader('x-request-id', req.id);

    next();
  });

  // ---- Security headers -------------------------------------------------
  app.use(
    helmet({
      crossOriginResourcePolicy: {
        policy: 'cross-origin',
      },
    }),
  );

  // ---- CORS -------------------------------------------------------------
  const corsOptions = env.cors.origins.includes('*')
    ? {
        origin: true,
        credentials: true,
      }
    : {
        origin: env.cors.origins,
        credentials: true,
      };

  app.use(cors(corsOptions));

  // ---- Body parsing -----------------------------------------------------
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ---- Response compression --------------------------------------------
  app.use(compression());

  // ---- HTTP request logging --------------------------------------------
  if (!env.isTest) {
    morgan.token('id', (req) => req.id);

    app.use(
      morgan(
        ':id :method :url :status :res[content-length] - :response-time ms',
        {
          stream: logger.stream,
        },
      ),
    );
  }

  // ---- Global rate limiting --------------------------------------------
  const globalLimiter = rateLimit({
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,

    // Health checks should not consume the global request limit.
    skip: (req) =>
      req.path === '/health' ||
      req.path === `${env.apiPrefix}/health`,

    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests — please slow down.',
        },
        requestId: req.id,
      });
    },
  });

  app.use(globalLimiter);

  // ---- Root health check ------------------------------------------------
  app.get('/health', (req, res) => {
    res.status(200).json({
      success: true,
      service: 'ethio-marketplace-api',
      status: 'ok',
      env: env.nodeEnv,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // ---- Root API information --------------------------------------------
  app.get('/', (req, res) => {
    res.status(200).json({
      success: true,
      name: 'Ethiopian Import-Sourcing Marketplace API',
      version: 'v1',
      health: `${env.apiPrefix}/health`,
    });
  });

  // ---- Versioned API routes ---------------------------------------------
  // Load the actual router instead of the temporary placeholder router.
  const apiRouter = require('./routes');

  app.use(env.apiPrefix, apiRouter);

  // ---- 404 and error handlers -------------------------------------------
  // These must remain after all routes.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = buildApp;