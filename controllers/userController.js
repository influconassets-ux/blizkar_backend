const mongoose = require('mongoose');
const User = require('../models/User');
const Match = require('../models/Match');

// @desc    Get all users except the current user (hides discreet users from discovery)
// @route   GET /api/users
// @access  Public
exports.getUsers = async (req, res) => {
    try {
        const { admin, limit = 20 } = req.query;
        // Hide all users in discreet mode from the general discovery list unless admin
        const query = admin === 'true' ? {} : { discreetMode: { $ne: true } };

        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .select('-password')
            .allowDiskUse()
            .lean();

        res.json(users);
    } catch (error) {
        console.error("[getUsers] Error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Toggle discreet mode
// @route   PUT /api/users/discreet
exports.toggleDiscreetMode = async (req, res) => {
    try {
        const { userId, discreetMode } = req.body;
        const user = await User.findByIdAndUpdate(userId, { discreetMode }, { new: true });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
const { processPhotos } = require('../utils/cloudinaryHelper');

// @desc    Update user profile
// @route   PUT /api/users/profile
exports.updateProfile = async (req, res) => {
    try {
        let { userId, photos, ...updates } = req.body;
        console.log(`[updateProfile] Updating user ${userId}`);
        
        // Don't allow updating sensitive or immutable fields
        const forbiddenFields = ['_id', 'id', 'password', 'role', 'coins', 'registrationStatus', 'email'];
        forbiddenFields.forEach(field => delete updates[field]);

        // Process photos if provided
        if (photos && photos.length > 0) {
            updates.photos = await processPhotos(photos);
        }

        const user = await User.findByIdAndUpdate(
            userId, 
            { $set: updates }, 
            { new: true, runValidators: true }
        );
        
        if (!user) {
            console.warn(`[updateProfile] User ${userId} not found`);
            return res.status(404).json({ message: 'User not found' });
        }

        console.log(`[updateProfile] Success for user ${userId}`);
        res.json(user);
    } catch (error) {
        console.error("[updateProfile] Error:", error);
        res.status(500).json({ message: error.message });
    }
};
