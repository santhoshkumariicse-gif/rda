const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    // License details
    licenseNumber: {
      type: String,
      required: [true, 'License number is required'],
      unique: true,
      trim: true,
    },
    licenseType: {
      type: String,
      enum: ['HGMV', 'MGV', 'Trailer', 'CEV', 'HazMat'],
      required: true,
    },
    licenseExpiry: {
      type: Date,
      required: true,
    },
    // Experience
    yearsExperience: {
      type: Number,
      min: 0,
      default: 0,
    },
    // Location
    baseLocation: {
      city: { type: String, required: true },
      state: { type: String },
      country: { type: String, default: 'India' },
      coordinates: {
        lat: Number,
        lng: Number,
      },
    },
    // Ratings
    averageRating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    totalRatings: {
      type: Number,
      default: 0,
    },
    // Stats
    totalTrips: {
      type: Number,
      default: 0,
    },
    // Status
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isLiveTracking: {
      type: Boolean,
      default: false,
    },
    liveLocation: {
      lat: Number,
      lng: Number,
      speedKmh: Number,
      heading: Number,
      accuracyMeters: Number,
      updatedAt: Date,
    },
    bio: {
      type: String,
      maxlength: 500,
    },
    // Additional certifications
    certifications: [
      {
        name: String,
        issuedBy: String,
        expiryDate: Date,
      },
    ],
  },
  { timestamps: true }
);

driverSchema.index({ 'baseLocation.city': 1, licenseType: 1, isAvailable: 1 });

module.exports = mongoose.model('Driver', driverSchema);
