const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LorryOwner',
      required: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    lorry: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lorry',
      required: true,
    },
    // Trip details
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    pickupLocation: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      postcode: String,
      coordinates: { lat: Number, lng: Number },
    },
    dropoffLocation: {
      address: { type: String, required: true },
      city: { type: String, required: true },
      postcode: String,
      coordinates: { lat: Number, lng: Number },
    },
    cargo: {
      description: String,
      weightTons: Number,
      specialInstructions: String,
    },
    // Pricing
    agreedRate: {
      type: Number, // daily rate in pence/cents
      required: true,
    },
    totalAmount: {
      type: Number,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    // Status lifecycle: pending → confirmed → in-progress → completed | cancelled
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled'],
      default: 'pending',
    },
    cancellationReason: {
      type: String,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Review
    review: {
      rating: { type: Number, min: 1, max: 5 },
      comment: String,
      createdAt: Date,
    },
    // Notification flags
    notificationSent: {
      confirmation: { type: Boolean, default: false },
      reminder: { type: Boolean, default: false },
      completion: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Compute total amount before save
bookingSchema.pre('save', function (next) {
  if (this.startDate && this.endDate && this.agreedRate) {
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return next(new Error('Invalid booking dates'));
    }

    if (end < start) {
      return next(new Error('End date cannot be earlier than start date'));
    }

    const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    const msPerDay = 1000 * 60 * 60 * 24;
    const inclusiveDays = Math.floor((endUtc - startUtc) / msPerDay) + 1;
    const clampedDays = Math.max(1, inclusiveDays);

    this.totalAmount = Math.max(0, clampedDays * this.agreedRate);
  }
  next();
});

bookingSchema.index({ owner: 1, status: 1 });
bookingSchema.index({ driver: 1, status: 1 });
bookingSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
