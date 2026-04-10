const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    // Recurring weekly schedule
    weeklySchedule: [
      {
        dayOfWeek: {
          type: Number, // 0=Sunday, 1=Monday ... 6=Saturday
          min: 0,
          max: 6,
        },
        startTime: String, // "08:00"
        endTime: String,   // "18:00"
        isAvailable: { type: Boolean, default: true },
      },
    ],
    // One-off blocked dates (holidays, sick days, etc.)
    blockedDates: [
      {
        date: { type: Date, required: true },
        reason: String,
      },
    ],
    // One-off extra available dates (outside normal schedule)
    extraDates: [
      {
        date: { type: Date, required: true },
        startTime: String,
        endTime: String,
      },
    ],
  },
  { timestamps: true }
);

availabilitySchema.index({ driver: 1 });

module.exports = mongoose.model('Availability', availabilitySchema);
