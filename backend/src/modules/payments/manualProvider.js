// backend/src/modules/payments/manualProvider.js
'use strict';

const { PaymentProviderInterface } = require('./paymentProvider.interface');
const ApiError = require('../../shared/utils/ApiError');
const env = require('../../config/env');

/**
 * Manual payment provider.
 * The platform collects NOTHING. The buyer pays an approved recipient
 * outside the app, uploads proof, and an admin verifies.
 */
class ManualProvider extends PaymentProviderInterface {
  get name() { return 'manual'; }

  async instructions(order) {
    const recipient = env.manualPayment || {};
    if (!recipient.accountNumber) {
      throw ApiError.conflict(
        'Manual payment instructions are not configured. Contact support.',
        { code: 'PAYMENT_NOT_CONFIGURED' },
      );
    }
    return {
      channel: recipient.channel || 'bank_transfer',
      recipientName: recipient.recipientName || 'Ethio Marketplace',
      recipientAccount: recipient.accountNumber,
      bankName: recipient.bankName || null,
      reference: order.referenceNumber,
      amountETB: order.totalPriceETB + (order.platformFeePayer === 'buyer' ? order.platformFeeETB : 0),
      currency: 'ETB',
      expiresAt: null,
      notes: [
        'Pay exactly the stated amount using the reference number above.',
        'Upload a receipt or transaction screenshot as proof.',
        'Your order only progresses after an admin verifies the payment.',
      ],
    };
  }

  async autoVerify(_recordId) {
    // Manual: nothing auto-verified.
    return null;
  }
}

module.exports = new ManualProvider();