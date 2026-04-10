const mongoose = require('mongoose');

const lorrySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LorryOwner',
      required: true,
    },
    registrationNumber: {
      type: String,
      required: [true, 'Registration number is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    make: {
      type: String,
      required: true,
      trim: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
    year: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ['Flatbed', 'Curtainsider', 'Box', 'Tipper', 'Tanker', 'Refrigerated', 'Low Loader'],
      required: true,
    },
    requiredLicense: {
      type: String,
      enum: ['HGMV', 'MGV', 'Trailer', 'CEV', 'HazMat'],
      required: true,
    },
    maxLoadTons: {
      type: Number,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lorry', lorrySchema);
