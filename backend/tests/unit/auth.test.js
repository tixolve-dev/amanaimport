
'use strict';

jest.mock('../../src/modules/users/user.model', () => ({
  User: {
    findOne: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock('../../src/shared/utils/tokenUtils', () => ({
  signAccessToken: jest.fn(),
  createRefreshToken: jest.fn(),
  hashToken: jest.fn(),
  generateOpaqueToken: jest.fn(),
  parseExpiry: jest.fn(),
}));

const { User } = require('../../src/modules/users/user.model');
const authService = require('../../src/modules/auth/auth.service');

describe('Authentication service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects login when the user does not exist', async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    await expect(
      authService.login({
        identifier: 'missing@example.com',
        password: 'WrongPassword123!',
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  test('does not reveal whether an email exists during password recovery', async () => {
    User.findOne.mockResolvedValue(null);

    await expect(
      authService.forgotPassword({ email: 'missing@example.com' }),
    ).resolves.toEqual({ delivered: false });
  });

  test('returns a not-found error for an unknown current user', async () => {
    User.findById.mockResolvedValue(null);

    await expect(
      authService.getCurrentUser('unknown-user-id'),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
