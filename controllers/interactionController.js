const Notification = require('../models/Notification');
const User = require('../models/User');
const Match = require('../models/Match');

// @desc    Send a gift and create notification
// @route   POST /api/interactions/gift
exports.sendGift = async (req, res) => {
    try {
        const { recipientId, gift } = req.body;
        const senderId = req.user._id;

        const sender = req.user; // Already populated by authMiddleware
        const recipient = await User.findById(recipientId);

        if (!sender || !recipient) {
            return res.status(404).json({ message: "Sender or Recipient not found" });
        }

        // Deduct coins if not a woman
        if (sender.gender !== 'Woman') {
            if (sender.coins < gift.cost) {
                return res.status(400).json({ message: "Insufficient coins" });
            }
            sender.coins -= gift.cost;
            await sender.save();
        }

        // Create notification
        const notification = new Notification({
            recipient: recipientId,
            sender: senderId,
            type: 'gift',
            content: `${sender.name} sent you a ${gift.name}!`,
            giftDetails: {
                name: gift.name,
                emoji: gift.emoji,
                cost: gift.cost
            }
        });

        await notification.save();

        // Emit real-time notification
        const io = req.app.get('io');
        if (io) {
            io.to(recipientId.toString()).emit('newNotification', notification);
        }

        // Handle Match Logic
        // Check if a match already exists (in either direction)
        const existingMatch = await Match.findOne({
            $or: [
                { sender: senderId, receiver: recipientId },
                { sender: recipientId, receiver: senderId }
            ]
        });

        if (!existingMatch) {
            // Create a new pending match request
            const newMatch = new Match({
                sender: senderId,
                receiver: recipientId,
                status: 'pending',
                giftSent: true
            });
            await newMatch.save();
        } else if (existingMatch.status === 'declined') {
            // If it was declined, sending another gift re-opens it as pending
            existingMatch.status = 'pending';
            existingMatch.sender = senderId;
            existingMatch.receiver = recipientId;
            existingMatch.giftSent = true;
            await existingMatch.save();
        }
        // If it's already 'pending' or 'accepted', we just continue (gift is still sent)

        res.status(201).json({ 
            message: "Gift sent successfully", 
            notification,
            senderCoins: sender.coins
        });
    } catch (error) {
        console.error("Error sending gift:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// @desc    Get notifications for a user
// @route   GET /api/interactions/notifications/:userId
exports.getNotifications = async (req, res) => {
    try {
        const userId = req.user._id;
        const notifications = await Notification.find({ recipient: userId })
            .populate('sender', 'name photos')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json(notifications);
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// @desc    Mark notifications as read
// @route   PUT /api/interactions/notifications/read/:userId
exports.markAsRead = async (req, res) => {
    try {
        const userId = req.user._id;
        await Notification.updateMany(
            { recipient: userId, read: false },
            { $set: { read: true } }
        );
        res.status(200).json({ message: "Notifications marked as read" });
    } catch (error) {
        console.error("Error marking as read:", error);
        res.status(500).json({ message: "Server error" });
    }
};
