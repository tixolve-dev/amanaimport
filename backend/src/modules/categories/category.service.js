// backend/src/modules/categories/category.service.js
'use strict';

const { Category } = require('./category.model');
const ApiError = require('../../shared/utils/ApiError');
const { paginate } = require('../../shared/utils/pagination');

async function listCategories({ includeInactive = false, parentOnly = false } = {}) {
  const query = {};
  if (!includeInactive) query.isActive = true;
  if (parentOnly) query.parentId = null;
  const categories = await Category.find(query).sort({ sortOrder: 1, name: 1 });
  return categories;
}

async function getCategoryById(id) {
  const cat = await Category.findById(id);
  if (!cat) throw ApiError.notFound('Category not found');
  return cat;
}

async function createCategory(payload) {
  const slug = (payload.slug || slugify(payload.name)).toLowerCase();
  const exists = await Category.findOne({ slug });
  if (exists) throw ApiError.conflict('Category with this slug exists', { code: 'DUPLICATE_SLUG' });

  if (payload.parentId) {
    const parent = await Category.findById(payload.parentId);
    if (!parent) throw ApiError.badRequest('Parent category not found');
    if (parent.parentId) {
      throw ApiError.badRequest('Nesting deeper than 2 levels is not supported');
    }
  }
  const cat = await Category.create({ ...payload, slug });
  return cat;
}

async function updateCategory(id, payload) {
  const cat = await Category.findById(id);
  if (!cat) throw ApiError.notFound('Category not found');

  if (payload.name && !payload.slug) payload.slug = slugify(payload.name);
  if (payload.slug) {
    const dup = await Category.findOne({ slug: payload.slug, _id: { $ne: id } });
    if (dup) throw ApiError.conflict('Category slug already in use');
  }
  Object.assign(cat, payload);
  await cat.save();
  return cat;
}

async function deleteCategory(id) {
  const children = await Category.countDocuments({ parentId: id });
  if (children > 0) {
    throw ApiError.conflict('Cannot delete a category that has subcategories');
  }
  const cat = await Category.findByIdAndDelete(id);
  if (!cat) throw ApiError.notFound('Category not found');
  return { deleted: true };
}

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

module.exports = {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  slugify,
  paginate, // re-export for convenience
};