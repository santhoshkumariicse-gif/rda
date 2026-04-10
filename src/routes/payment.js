const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { createCheckoutSession } = require('../controllers/paymentController');
const { auditPayment } = require('../middleware/audit');

router.post('/create-checkout-session', protect, auditPayment, createCheckoutSession);

module.exports = router;
