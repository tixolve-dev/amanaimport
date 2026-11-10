// backend/src/shared/utils/ApiResponse.js
'use strict';

/**
 * Standard success response builder.
 * {
 *   success: true,
 *   message: string,
 *   data: any,
 *   meta?: { pagination? }
 * }
 */
class ApiResponse {
  /**
   * @param {any} data
   * @param {string} [message]
   * @param {object} [meta]
   */
  constructor(data = null, message = 'OK', meta = undefined) {
    this.success = true;
    this.message = message;
    this.data = data;
    if (meta !== undefined) this.meta = meta;
  }

  /** Wrap a value. */
  static ok(data, message = 'OK', meta) {
    return new ApiResponse(data, message, meta);
  }

  /** 201 Created. */
  static created(data, message = 'Created', meta) {
    const res = new ApiResponse(data, message, meta);
    res.statusCode = 201;
    return res;
  }

  /** 204-style (still returns a body, caller should send with 200 or use 204 separately). */
  static noContent(message = 'No content') {
    return new ApiResponse(null, message);
  }

  /**
   * Paginated wrapper — merges pagination into meta.
   * @param {any[]} items
   * @param {object} pagination { page, limit, total, totalPages }
   */
  static paginated(items, pagination, message = 'OK') {
    return new ApiResponse(items, message, { pagination });
  }
}

module.exports = ApiResponse;