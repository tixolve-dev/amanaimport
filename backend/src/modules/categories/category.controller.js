// backend/src/modules/categories/category.controller.js
'use strict';

const ApiResponse = require('../../shared/utils/ApiResponse');
const service = require('./category.service');

async function list(req, res, next) {
  try {
    const includeInactive = req.user?.role === 'admin' && req.query.includeInactive === 'true';
    const parentOnly = req.query.parentOnly === 'true';
    const items = await service.listCategories({ includeInactive, parentOnly });
    return res.status(200).json(ApiResponse.ok(items, 'OK'));
  } catch (err) { return next(err); }
}

async function get(req, res, next) {
  try {
    const cat = await service.getCategoryById(req.params.id);
    return res.status(200).json(ApiResponse.ok(cat));
  } catch (err) { return next(err); }
}

async function create(req, res, next) {
  try {
    const cat = await service.createCategory(req.body);
    return res.status(201).json(ApiResponse.created(cat, 'Category created'));
  } catch (err) { return next(err); }
}

async function update(req, res, next) {
  try {
    const cat = await service.updateCategory(req.params.id, req.body);
    return res.status(200).json(ApiResponse.ok(cat, 'Category updated'));
  } catch (err) { return next(err); }
}

async function remove(req, res, next) {
  try {
    await service.deleteCategory(req.params.id);
    return res.status(200).json(ApiResponse.ok(null, 'Category deleted'));
  } catch (err) { return next(err); }
}

module.exports = { list, get, create, update, remove };