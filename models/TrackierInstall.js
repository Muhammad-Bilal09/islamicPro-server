const mongoose = require('mongoose');

const trackierInstallSchema = new mongoose.Schema(
  {
    clickId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'already_processed'],
      default: 'success',
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
    trackierResponseStatus: {
      type: Number,
    },
    trackierResponseBody: {
      type: String,
    },
    requestDurationMs: {
      type: Number,
    },
    errorMessage: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('TrackierInstall', trackierInstallSchema);
