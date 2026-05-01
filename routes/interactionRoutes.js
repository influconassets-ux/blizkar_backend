const express = require('express');
const router = express.Router();
const { 
    sendGift, 
    getNotifications, 
    markAsRead 
} = require('../controllers/interactionController');
const { protect } = require('../middleware/authMiddleware');

router.post('/gift', protect, sendGift);
router.get('/notifications/:userId', protect, getNotifications);
router.put('/notifications/read/:userId', protect, markAsRead);

module.exports = router;
