const express = require('express');
const router = express.Router();
const { 
    sendGift, 
    getNotifications, 
    markAsRead 
} = require('../controllers/interactionController');

router.post('/gift', sendGift);
router.get('/notifications/:userId', getNotifications);
router.put('/notifications/read/:userId', markAsRead);

module.exports = router;
