const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driverController');
const { protect, authorize } = require('../middleware/auth');

// GET /api/drivers?city=&licenseType=&date=&page=&limit=
router.get('/', driverController.getDrivers);

// GET /api/drivers/my-bookings  (driver's own bookings)
router.get('/my-bookings', protect, authorize('driver'), driverController.getMyBookings);

// GET /api/drivers/analytics
router.get('/analytics', protect, authorize('driver'), driverController.getAnalytics);

// PUT /api/drivers/live-location
router.put('/live-location', protect, authorize('driver'), driverController.updateLiveLocation);

// PUT /api/drivers/live-location/stop
router.put('/live-location/stop', protect, authorize('driver'), driverController.stopLiveLocation);

// PUT /api/drivers/profile
router.put('/profile', protect, authorize('driver'), driverController.updateProfile);

// PUT /api/drivers/availability
router.put('/availability', protect, authorize('driver'), driverController.updateAvailability);

// GET /api/drivers/:id
router.get('/:id', driverController.getDriver);

module.exports = router;
