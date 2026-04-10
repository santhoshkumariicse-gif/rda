const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');
const { adminLimiter } = require('../middleware/rateLimit');
const { auditAdminAction } = require('../middleware/audit');

// All admin routes require admin role
router.use(protect, authorize('admin'), adminLimiter, auditAdminAction);

// GET /api/admin/stats
router.get('/stats', adminController.getDashboardStats);

// GET /api/admin/users?role=&search=&page=&limit=
router.get('/users', adminController.getAllUsers);

// PUT /api/admin/users/:userId/toggle-status
router.put('/users/:userId/toggle-status', adminController.toggleUserStatus);

// GET /api/admin/bookings?status=&page=&limit=
router.get('/bookings', adminController.getAllBookings);

// GET /api/admin/analytics
router.get('/analytics', adminController.getAnalytics);

// GET /api/admin/all-data
router.get('/all-data', adminController.getAllData);

module.exports = router;
