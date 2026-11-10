// backend/src/modules/payments/paymentProvider.interface.js
'use strict';

/**
 * Payment Provider Interface (contract).
 *
 * Every method must return a plain object. Errors must throw ApiError.
 * Providers must NEVER auto-mark a payment as verified — that is an admin action.
 *
 * Fields a provider returns:
 *   - instructions(order): { channel, recipientName, recipientAccount, reference, amountETB, expiresAt }
 *   - submitEvidence(input): { transactionReference, amountETB, paidAt, receiptUrl }
 *   - verify(recordId, adminId, note): see payment.service
 */
class PaymentProviderInterface {
  get name() { throw new Error('Not implemented'); }

  /**
   * Return human-readable payment instructions for an order.
   * @param {import('mongoose').Document} order
   */
  // eslint-disable-next-line no-unused-vars
  async instructions(order) { throw new Error('Not implemented'); }

  /**
   * Placeholder for future automated verification via provider webhook/API.
   * Manual provider returns null and defers to admin review.
   */
  // eslint-disable-next-line no-unused-vars
  async autoVerify(recordId) { return null; }
}

module.exports = { PaymentProviderInterface };