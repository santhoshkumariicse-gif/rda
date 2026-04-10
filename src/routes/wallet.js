const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getWallet,
  getTransactions,
  addFunds,
  withdraw,
} = require('../controllers/walletController');

// All wallet routes require authentication
router.use(protect);

router.get('/', getWallet);
router.get('/transactions', getTransactions);
router.post('/add-funds', addFunds);
router.post('/withdraw', withdraw);

module.exports = router;
