
'use strict';

const {
  QUOTATION_STATUS,
  IMPORTER_EDITABLE,
  BUYER_ACCEPTABLE,
} = require('../../src/modules/quotations/quotation.statuses');

describe('Quotation statuses', () => {
  test('defines the expected quotation statuses', () => {
    expect(QUOTATION_STATUS).toMatchObject({
      SUBMITTED: 'submitted',
      UPDATED: 'updated',
      WITHDRAWN: 'withdrawn',
      ACCEPTED: 'accepted',
      REJECTED: 'rejected',
      EXPIRED: 'expired',
    });
  });

  test('does not allow changes to the status definitions', () => {
    expect(Object.isFrozen(QUOTATION_STATUS)).toBe(true);
  });

  test('allows importers to edit or withdraw submitted and updated quotations', () => {
    expect(IMPORTER_EDITABLE).toEqual([
      QUOTATION_STATUS.SUBMITTED,
      QUOTATION_STATUS.UPDATED,
    ]);
  });

  test('allows buyers to accept submitted and updated quotations', () => {
    expect(BUYER_ACCEPTABLE).toEqual([
      QUOTATION_STATUS.SUBMITTED,
      QUOTATION_STATUS.UPDATED,
    ]);
  });

  test('does not make withdrawn, accepted, rejected, or expired quotations editable', () => {
    const finalStatuses = [
      QUOTATION_STATUS.WITHDRAWN,
      QUOTATION_STATUS.ACCEPTED,
      QUOTATION_STATUS.REJECTED,
      QUOTATION_STATUS.EXPIRED,
    ];

    for (const status of finalStatuses) {
      expect(IMPORTER_EDITABLE).not.toContain(status);
      expect(BUYER_ACCEPTABLE).not.toContain(status);
    }
  });
});
