const rateLimit = require('express-rate-limit');

// General API rate limiting
const createLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message },
});

// Auth endpoints - stricter limits
const authLimiter = createLimiter(
  15 * 60 * 1000, // 15 minutes
  10, // 10 attempts
  'Too many auth attempts. Please try again later.'
);

// File uploads - very strict limits
const uploadLimiter = createLimiter(
  60 * 60 * 1000, // 1 hour
  5, // 5 uploads
  'Upload limit exceeded. Please try again later.'
);

// Chat endpoints
const chatLimiter = createLimiter(
  5 * 60 * 1000, // 5 minutes
  30, // 30 messages
  'Chat rate limit exceeded. Please slow down.'
);

// Admin operations
const adminLimiter = createLimiter(
  15 * 60 * 1000, // 15 minutes
  50, // 50 admin operations
  'Admin operation limit exceeded.'
);

module.exports = {
  authLimiter,
  uploadLimiter,
  chatLimiter,
  adminLimiter,
};