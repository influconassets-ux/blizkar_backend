const express = require('express');
const router = express.Router();
const { getUsers, toggleDiscreetMode, updateProfile } = require('../controllers/userController');
const User = require('../models/User');

router.get('/', getUsers);
router.put('/discreet', toggleDiscreetMode);
router.put('/profile', updateProfile);

router.post('/block', async (req, res) => {
    try {
        const { userId, targetId } = req.body;
        await User.findByIdAndUpdate(userId, { $addToSet: { blockedUsers: targetId } });
        res.json({ message: 'User blocked' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/unblock', async (req, res) => {
    try {
        const { userId, targetId } = req.body;
        await User.findByIdAndUpdate(userId, { $pull: { blockedUsers: targetId } });
        res.json({ message: 'User unblocked' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.get('/block-status/:userId/:targetId', async (req, res) => {
    try {
        const { userId, targetId } = req.params;
        const user = await User.findById(userId);
        const target = await User.findById(targetId);
        
        res.json({
            blockedByMe: user.blockedUsers.includes(targetId),
            blockedByThem: target.blockedUsers.includes(userId)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
