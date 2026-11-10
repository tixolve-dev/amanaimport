
'use strict';

jest.mock('../../src/modules/commissions/commissionRule.model', () => ({
  CommissionRule: {},
  FEE_TYPE: {
    PERCENTAGE: 'percentage',
    FIXED: 'fixed',
  },
  PAYER: {
    BUYER: 'buyer',
    IMPORTER: 'importer',
  },
}));

jest.mock('../../src/modules/commissions/commissionRecord.model', () => ({
  CommissionRecord: {},
  REVENUE_STATE: {
    PENDING: 'pending',
    INVOICED: 'invoiced',
    RECEIVED: 'received',
    WAIVED: 'waived',
    REFUNDED: 'refunded',
  },
}));

const {
  computeFeeForRule,
  FEE_TYPE,
} = require('../../src/modules/commissions/commission.service');

describe('Commission fee calculation', () => {
  test('calculates a percentage fee', () => {
    const fee = computeFeeForRule({
      feeType: FEE_TYPE.PERCENTAGE,
      percentage: 5,
    }, 1000);

    expect(fee).toBe(50);
  });

  test('rounds percentage fees to two decimal places', () => {
    const fee = computeFeeForRule({
      feeType: FEE_TYPE.PERCENTAGE,
      percentage: 2.5,
    }, 123.45);

    expect(fee).toBe(3.09);
  });

  test('calculates a fixed fee', () => {
    const fee = computeFeeForRule({
      feeType: FEE_TYPE.FIXED,
      fixedAmountETB: 75,
    }, 1000);

    expect(fee).toBe(75);
  });

  test('applies the minimum fee', () => {
    const fee = computeFeeForRule({
      feeType: FEE_TYPE.PERCENTAGE,
      percentage: 1,
      minFeeETB: 20,
    }, 500);

    expect(fee).toBe(20);
  });

  test('applies the maximum fee', () => {
    const fee = computeFeeForRule({
      feeType: FEE_TYPE.PERCENTAGE,
      percentage: 10,
      maxFeeETB: 50,
    }, 1000);

    expect(fee).toBe(50);
  });

  test('applies minimum and maximum limits together', () => {
    const rule = {
      feeType: FEE_TYPE.PERCENTAGE,
      percentage: 10,
      minFeeETB: 20,
      maxFeeETB: 80,
    };

    expect(computeFeeForRule(rule, 100)).toBe(20);
    expect(computeFeeForRule(rule, 1000)).toBe(80);
  });

  test('returns zero for a zero percentage fee without a minimum', () => {
    const fee = computeFeeForRule({
      feeType: FEE_TYPE.PERCENTAGE,
      percentage: 0,
    }, 500);

    expect(fee).toBe(0);
  });

  test('rejects a negative order value', () => {
    expect(() => computeFeeForRule({
      feeType: FEE_TYPE.PERCENTAGE,
      percentage: 5,
    }, -100)).toThrow('orderValueETB must be >= 0');
  });
});
