// backend/src/modules/messaging/conversation.model.js
'use strict';

const mongoose = require('mongoose');

const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    // One conversation per order — created only after acceptance
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    importer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    lastMessageAt: { type: Date, default: null, index: true },
    lastMessagePreview: { type: String, default: '', maxlength: 200 },
    buyerUnreadCount: { type: Number, default: 0 },
    importerUnreadCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const Conversation = mongoose.model('Conversation', conversationSchema);
module.exports = { Conversation };