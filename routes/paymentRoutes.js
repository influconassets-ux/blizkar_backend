const express = require('express');
const router = express.Router();
const { rechargeCoins, getStats } = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

// All routes prefixed with /api/payments
router.post('/recharge', protect, rechargeCoins);
router.get('/stats', protect, getStats);

module.exports = router;
