const express = require('express');
const router = express.Router();
const { rechargeCoins, getStats } = require('../controllers/paymentController');

// All routes prefixed with /api/payments
router.post('/recharge', rechargeCoins);
router.get('/stats', getStats);

module.exports = router;
