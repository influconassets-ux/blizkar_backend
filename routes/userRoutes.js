const express = require('express');
const router = express.Router();
const { getUsers, toggleDiscreetMode, updateProfile } = require('../controllers/userController');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getUsers);
router.put('/discreet', protect, toggleDiscreetMode);
router.put('/profile', protect, updateProfile);

router.post('/block', protect, async (req, res) => {
    try {
        const { targetId } = req.body;
        await User.findByIdAndUpdate(req.user._id, { $addToSet: { blockedUsers: targetId } });
        res.json({ message: 'User blocked' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.post('/unblock', protect, async (req, res) => {
    try {
        const { targetId } = req.body;
        await User.findByIdAndUpdate(req.user._id, { $pull: { blockedUsers: targetId } });
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
