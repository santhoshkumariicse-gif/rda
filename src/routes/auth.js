const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { authLimiter, uploadLimiter } = require('../middleware/rateLimit');
const { auditLogout, auditPasswordChange, auditAvatarUpload } = require('../middleware/audit');

const isAllowedAuthEmail = (value) => {
  const normalized = String(value || '').toLowerCase();
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  return normalized.endsWith('@gmail.com') || (adminEmail && normalized === adminEmail);
};

// POST /api/auth/register
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email')
      .isEmail().withMessage('Valid email required')
      .normalizeEmail()
      .custom(isAllowedAuthEmail)
      .withMessage('Only Gmail addresses are allowed (except configured admin email)'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['driver', 'owner']).withMessage('Role must be driver or owner'),
    body('termsAccepted').custom((value) => value === true).withMessage('Terms and Conditions must be accepted'),
    body('termsVersion').trim().notEmpty().withMessage('Terms version is required'),
    body('privacyAccepted').custom((value) => value === true).withMessage('Privacy Policy must be accepted'),
    body('privacyVersion').trim().notEmpty().withMessage('Privacy version is required'),
  ],
  authController.register
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email')
      .isEmail().withMessage('Valid email required')
      .normalizeEmail()
      .custom(isAllowedAuthEmail)
      .withMessage('Only Gmail addresses are allowed (except configured admin email)'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  authController.login
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  [
    body('email')
      .isEmail().withMessage('Valid email required')
      .normalizeEmail()
      .custom(isAllowedAuthEmail)
      .withMessage('Only Gmail addresses are allowed (except configured admin email)'),
  ],
  authController.forgotPassword
);

// GET /api/auth/verify-email/:token
router.get(
  '/verify-email/:token',
  [
    param('token').isLength({ min: 10 }).withMessage('Valid verify token required'),
  ],
  authController.verifyEmail
);

// POST /api/auth/verify-email-manual (development only)
router.post(
  '/verify-email-manual',
  [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  ],
  authController.verifyEmailManual
);

// PUT /api/auth/reset-password/:token
router.put(
  '/reset-password/:token',
  [
    param('token').isLength({ min: 10 }).withMessage('Valid reset token required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  authController.resetPassword
);

// POST /api/auth/logout
router.post('/logout', protect, auditLogout, authController.logout);

// GET /api/auth/me
router.get('/me', protect, authController.getMe);

// PUT /api/auth/change-password
router.put('/change-password', protect, auditPasswordChange, authController.changePassword);

// POST /api/auth/avatar
router.post('/avatar', protect, uploadLimiter, upload.single('avatar'), auditAvatarUpload, authController.uploadAvatar);

// POST /api/auth/google
router.post('/google', authController.googleLogin);

module.exports = router;
