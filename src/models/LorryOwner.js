const mongoose = require('mongoose');

const lorryOwnerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    companyRegistrationNo: {
      type: String,
      trim: true,
    },
    vatNumber: {
      type: String,
      trim: true,
    },
    address: {
      street: String,
      city: { type: String, required: true },
      state: String,
      postcode: String,
      country: { type: String, default: 'India' },
    },
    contactPerson: {
      name: String,
      phone: String,
      email: String,
    },
    totalBookings: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LorryOwner', lorryOwnerSchema);
