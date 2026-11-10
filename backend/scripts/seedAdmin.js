// backend/scripts/seedAdmin.js
'use strict';

const mongoose = require('mongoose');
const env = require('../src/config/env');
const logger = require('../src/config/logger');
const { User } = require('../src/modules/users/user.model');
const { ROLES } = require('../src/shared/constants/roles');
const { USER_STATUS } = require('../src/shared/constants/statuses');

async function run() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const phone = process.env.SEED_ADMIN_PHONE;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const fullName = process.env.SEED_ADMIN_NAME || 'System Administrator';

  if (!email || !phone || !password) {
    throw new Error('SEED_ADMIN_EMAIL, SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD are required');
  }

  await mongoose.connect(env.mongoUri);
  logger.info('[seed] connected');

  const existing = await User.findOne({ $or: [{ email }, { phone }] });
  if (existing) {
    if (existing.role !== ROLES.ADMIN) {
      throw new Error('A user with that email/phone exists but is not an admin');
    }
    logger.info('[seed] admin already exists — no changes');
  } else {
    const admin = new User({
      fullName, email, phone, role: ROLES.ADMIN,
      status: USER_STATUS.ACTIVE, isEmailVerified: true, isPhoneVerified: true,
    });
    await admin.setPassword(password);
    await admin.save();
    logger.info(`[seed] admin created: ${email}`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});