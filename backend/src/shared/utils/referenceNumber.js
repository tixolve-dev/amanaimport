// backend/src/shared/utils/referenceNumber.js
'use strict';

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

function randomSegment(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function dateSegment(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function makeRef(prefix) {
  return `${prefix}-${dateSegment()}-${randomSegment(6)}`;
}

const generateRequestRef = () => makeRef('REQ');
const generateOrderRef = () => makeRef('ORD');
const generateQuoteRef = () => makeRef('QTE');

module.exports = { generateRequestRef, generateOrderRef, generateQuoteRef };