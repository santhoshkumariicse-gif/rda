const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');
const { auditBookingAction } = require('../middleware/audit');

// POST /api/bookings  – create booking (owner only)
router.post('/', protect, authorize('owner'), auditBookingAction('BOOKING_CREATED'), bookingController.createBooking);

// GET /api/bookings/:id
router.get('/:id', protect, bookingController.getBooking);

// PUT /api/bookings/:id/confirm  – driver confirms
router.put('/:id/confirm', protect, authorize('driver'), auditBookingAction('BOOKING_CONFIRMED'), bookingController.confirmBooking);

// PUT /api/bookings/:id/start  – driver starts confirmed booking
router.put('/:id/start', protect, authorize('driver'), auditBookingAction('BOOKING_STARTED'), bookingController.startBooking);

// PUT /api/bookings/:id/cancel  – owner or driver cancels
router.put('/:id/cancel', protect, authorize('owner', 'driver', 'admin'), auditBookingAction('BOOKING_CANCELED'), bookingController.cancelBooking);

// PUT /api/bookings/:id/complete  – driver marks complete
router.put('/:id/complete', protect, authorize('driver'), auditBookingAction('BOOKING_COMPLETED'), bookingController.completeBooking);

// POST /api/bookings/:id/review – owner submits review
router.post('/:id/review', protect, authorize('owner'), auditBookingAction('BOOKING_REVIEW_SUBMITTED'), bookingController.submitReview);

module.exports = router;
