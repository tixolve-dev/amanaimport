// backend/src/shared/utils/pagination.js
'use strict';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit));
  const skip = (page - 1) * limit;
  const sort = parseSort(query.sort);
  return { page, limit, skip, sort };
}

function parseSort(sortRaw) {
  if (!sortRaw || typeof sortRaw !== 'string') return { createdAt: -1 };
  const [field, dir] = sortRaw.split(':');
  return { [field || 'createdAt']: dir === 'asc' ? 1 : -1 };
}

function buildPaginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Executes a Mongoose model query with pagination. Returns items + meta.
 */
async function paginate(Model, filter, { page, limit, skip, sort }, projection = undefined) {
  const [items, total] = await Promise.all([
    Model.find(filter).sort(sort).skip(skip).limit(limit).select(projection || ''),
    Model.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

module.exports = { parsePagination, buildPaginationMeta, paginate, MAX_LIMIT, DEFAULT_LIMIT };