// backend/src/modules/uploads/upload.controller.js
'use strict';

const multer = require('multer');
const env = require('../../config/env');
const ApiResponse = require('../../shared/utils/ApiResponse');
const ApiError = require('../../shared/utils/ApiError');
const service = require('./upload.service');

// Memory storage — we hand the buffer to the storage provider
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.uploads.maxFileSizeMb * 1024 * 1024,
    files: 10,
  },
});

const single = upload.single('file');
const multiple = upload.array('files', 10);

async function handleSingle(req, res, next) {
  try {
    if (!req.file) throw ApiError.badRequest('No file uploaded');
    const folder = req.body.folder || req.query.folder;
    if (!folder) throw ApiError.badRequest('folder is required');
    const result = await service.uploadFile({
      file: req.file,
      folder,
      userId: req.user.id,
    });
    return res.status(201).json(ApiResponse.created(result, 'File uploaded'));
  } catch (err) { return next(err); }
}

async function handleMultiple(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      throw ApiError.badRequest('No files uploaded');
    }
    const folder = req.body.folder || req.query.folder;
    if (!folder) throw ApiError.badRequest('folder is required');
    const results = [];
    for (const file of req.files) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await service.uploadFile({ file, folder, userId: req.user.id }));
    }
    return res.status(201).json(ApiResponse.created(results, 'Files uploaded'));
  } catch (err) { return next(err); }
}

async function handleDelete(req, res, next) {
  try {
    const key = Array.isArray(req.params.key)
      ? req.params.key.join('/')
      : req.params.key;

    if (!key) throw ApiError.badRequest('File key is required');

    await service.deleteFile(key, req.user.id);
    return res.status(200).json(ApiResponse.ok(null, 'File deleted'));
  } catch (err) {
    return next(err);
  }
}

module.exports = { single, multiple, handleSingle, handleMultiple, handleDelete };
