const User = require('../models/User');

// @desc    Get all users except the current user
// @route   GET /api/users
// @access  Private (though we'll keep it public for now for simplicity as requested)
exports.getUsers = async (req, res) => {
    try {
        const users = await User.find({}).sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
