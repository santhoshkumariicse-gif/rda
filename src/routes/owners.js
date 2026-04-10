const express = require('express');
const router = express.Router();
const ownerController = require('../controllers/lorryOwnerController');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication and owner role
router.use(protect, authorize('owner'));

// PUT /api/owners/profile
router.put('/profile', ownerController.updateProfile);

// GET /api/owners/lorries
router.get('/lorries', ownerController.getMyLorries);

// POST /api/owners/lorries
router.post('/lorries', ownerController.addLorry);

// PUT /api/owners/lorries/:lorryId
router.put('/lorries/:lorryId', ownerController.updateLorry);

// DELETE /api/owners/lorries/:lorryId
router.delete('/lorries/:lorryId', ownerController.deleteLorry);

// GET /api/owners/my-bookings
router.get('/my-bookings', ownerController.getMyBookings);

// GET /api/owners/analytics
router.get('/analytics', ownerController.getAnalytics);

// GET /api/owners/live-tracking
router.get('/live-tracking', ownerController.getLiveTracking);

// POST /api/owners/loads
router.post('/loads', ownerController.postLoad);

module.exports = router;
