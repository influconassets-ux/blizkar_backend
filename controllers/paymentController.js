const Transaction = require('../models/Transaction');
const User = require('../models/User');

// @desc    Recharge user coins
// @route   POST /api/payments/recharge
exports.rechargeCoins = async (req, res) => {
    try {
        const { userId, amount, coinsToAdd } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Create transaction record
        const transaction = new Transaction({
            userId,
            amount: amount || 0, // Actual money spent
            coinsPurchased: coinsToAdd
        });

        await transaction.save();

        // Update user coins
        user.coins = (user.coins || 0) + coinsToAdd;
        await user.save();

        res.status(200).json({ 
            message: "Recharge successful", 
            newBalance: user.coins,
            transaction 
        });
    } catch (error) {
        console.error("Recharge error:", error);
        res.status(500).json({ message: "Server error during recharge" });
    }
};

// @desc    Get recharge statistics for admin
// @route   GET /api/payments/stats?month=4&year=2026
exports.getStats = async (req, res) => {
    try {
        const { month, year } = req.query;
        let matchStage = {};

        if (month && year) {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);
            matchStage = { createdAt: { $gte: startDate, $lte: endDate } };
        } else if (year) {
            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year, 11, 31, 23, 59, 59);
            matchStage = { createdAt: { $gte: startDate, $lte: endDate } };
        }

        const filteredStats = await Transaction.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$amount" },
                    totalCoins: { $sum: "$coinsPurchased" },
                    totalTransactions: { $count: {} }
                }
            }
        ]);

        const transactions = await Transaction.find(matchStage)
            .populate('userId', 'name email')
            .sort({ createdAt: -1 })
            .limit(100);

        // Predefined snapshots (Today, Week, Month) - only if no filters are active
        const now = new Date();
        const startOfDay = new Date(now.setHours(0,0,0,0));
        const daily = await Transaction.aggregate([
            { $match: { createdAt: { $gte: startOfDay } } },
            { $group: { _id: null, total: { $sum: "$amount" }, coins: { $sum: "$coinsPurchased" } } }
        ]);

        const startOfWeek = new Date(new Date().setDate(now.getDate() - 7));
        const weekly = await Transaction.aggregate([
            { $match: { createdAt: { $gte: startOfWeek } } },
            { $group: { _id: null, total: { $sum: "$amount" }, coins: { $sum: "$coinsPurchased" } } }
        ]);

        res.status(200).json({
            filtered: filteredStats[0] || { totalRevenue: 0, totalCoins: 0, totalTransactions: 0 },
            transactions,
            daily: daily[0] || { total: 0, coins: 0 },
            weekly: weekly[0] || { total: 0, coins: 0 }
        });
    } catch (error) {
        console.error("Stats fetch error:", error);
        res.status(500).json({ message: "Server error fetching stats" });
    }
};
