const mongoose = require('mongoose');

const userDeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: 'guest_user',
      index: true,
    },
    fcmToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
      default: 'android',
    },
    latitude: {
      type: Number,
      default: 24.8607,
    },
    longitude: {
      type: Number,
      default: 67.0011,
    },
    timezone: {
      type: String,
      default: 'Asia/Karachi',
    },
    lastPushedPrayer: {
      type: String,
      default: '',
    },
    lastPushedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('UserDevice', userDeviceSchema);
