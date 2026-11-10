// backend/scripts/seedCategories.js
'use strict';

const mongoose = require('mongoose');
const env = require('../src/config/env');
const logger = require('../src/config/logger');
const { Category } = require('../src/modules/categories/category.model');
const { slugify } = require('../src/modules/categories/category.service');

const CATEGORIES = [
  { name: 'Phones, Computers & Electronics', icon: 'devices' },
  { name: 'Vehicle Spare Parts & Automotive', icon: 'car' },
  { name: 'Machinery, Industrial Equipment & Tools', icon: 'factory' },
  { name: 'Construction Materials & Equipment', icon: 'construction' },
  { name: 'Clothing, Footwear & Fashion', icon: 'shirt' },
  { name: 'Home Appliances & Household', icon: 'home' },
  { name: 'Beauty & Personal Care', icon: 'spa' },
  { name: 'Agricultural Equipment & Supplies', icon: 'agriculture' },
  { name: 'Office Equipment & Business Supplies', icon: 'business' },
  { name: 'Other Permitted Products', icon: 'category' },
];

async function run() {
  await mongoose.connect(env.mongoUri);
  logger.info('[seed] connected');
  let created = 0; let updated = 0;

  for (let i = 0; i < CATEGORIES.length; i += 1) {
    const c = CATEGORIES[i];
    const slug = slugify(c.name);
    const existing = await Category.findOne({ slug });
    if (!existing) {
      await Category.create({ name: c.name, slug, icon: c.icon, sortOrder: i });
      created += 1;
    } else {
      existing.name = c.name;
      existing.icon = c.icon;
      existing.sortOrder = i;
      await existing.save();
      updated += 1;
    }
  }

  logger.info(`[seed] categories: created=${created}, updated=${updated}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});