const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// We use model names to avoid direct require issues if they occur
const Message = mongoose.model('Message');
const User = mongoose.model('User');
const Match = mongoose.model('Match');

// 1. Admin Routes (Prioritize these)
router.get('/admin/conversations/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Find all messages involving this user
        const messages = await Message.find({
            $or: [
                { sender: userId },
                { receiver: userId }
            ]
        })
        .sort({ createdAt: -1 })
        .populate('sender', 'name photos')
        .populate('receiver', 'name photos');

        const conversationMap = new Map();

        for (const msg of messages) {
            if (!msg.sender || !msg.receiver) continue;

            const senderId = msg.sender._id.toString();
            const receiverId = msg.receiver._id.toString();
            
            const isSender = senderId === userId;
            const otherUser = isSender ? msg.receiver : msg.sender;
            const otherUserId = otherUser._id.toString();

            if (!conversationMap.has(otherUserId)) {
                conversationMap.set(otherUserId, {
                    userId: otherUserId,
                    name: otherUser.name || 'Unknown User',
                    img: otherUser.photos?.[0] || 'https://i.pravatar.cc/150',
                    lastMsg: msg.messageType === 'image' ? '📷 Photo' : (msg.messageType === 'gift' ? '🎁 Gift' : msg.content),
                    createdAt: msg.createdAt
                });
            }
        }

        res.json(Array.from(conversationMap.values()));
    } catch (error) {
        console.error("Error fetching admin conversations:", error);
        res.status(500).json({ message: error.message });
    }
});

router.get('/admin/history/:userId/:otherUserId', async (req, res) => {
    try {
        const { userId, otherUserId } = req.params;

        const messages = await Message.find({
            $or: [
                { sender: userId, receiver: otherUserId },
                { sender: otherUserId, receiver: userId }
            ]
        }).sort({ createdAt: 1 });
        res.json(messages);
    } catch (error) {
        console.error("Error fetching admin messages:", error);
        res.status(500).json({ message: error.message });
    }
});

// 2. Specific routes
router.get('/conversations/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Fetch accepted matches first
        const acceptedMatches = await Match.find({
            $or: [
                { sender: userId, status: 'accepted' },
                { receiver: userId, status: 'accepted' }
            ]
        });

        const matchedUserIds = acceptedMatches.map(m => 
            m.sender.toString() === userId ? m.receiver.toString() : m.sender.toString()
        );

        // Find all messages involving this user AND matched users
        const messages = await Message.find({
            $or: [
                { sender: userId, receiver: { $in: matchedUserIds } },
                { receiver: userId, sender: { $in: matchedUserIds } }
            ]
        })
        .sort({ createdAt: -1 })
        .populate('sender', 'name photos')
        .populate('receiver', 'name photos');

        const conversationMap = new Map();

        for (const msg of messages) {
            if (!msg.sender || !msg.receiver) continue;

            const senderId = msg.sender._id.toString();
            const receiverId = msg.receiver._id.toString();
            
            const isSender = senderId === userId;
            const otherUser = isSender ? msg.receiver : msg.sender;
            const otherUserId = otherUser._id.toString();

            if (!conversationMap.has(otherUserId)) {
                conversationMap.set(otherUserId, {
                    userId: otherUserId,
                    name: otherUser.name || 'Unknown User',
                    img: otherUser.photos?.[0] || 'https://i.pravatar.cc/150',
                    lastMsg: msg.messageType === 'image' ? '📷 Photo' : (msg.messageType === 'gift' ? '🎁 Gift' : msg.content),
                    unreadCount: 0,
                    createdAt: msg.createdAt
                });
            }

            // Increment unread count if the message is for the current user and unread
            if (!msg.read && receiverId === userId) {
                const convo = conversationMap.get(otherUserId);
                convo.unreadCount += 1;
            }
        }

        res.json(Array.from(conversationMap.values()));
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ message: error.message });
    }
});

router.get('/unread-count/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const count = await Message.countDocuments({
            receiver: userId,
            read: false
        });
        res.json({ count });
    } catch (error) {
        console.error("Error fetching unread count:", error);
        res.status(500).json({ message: error.message });
    }
});

router.get('/unread-senders/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const senderIds = await Message.distinct('sender', {
            receiver: userId,
            read: false
        });
        res.json({ senderIds });
    } catch (error) {
        console.error("Error fetching unread senders:", error);
        res.status(500).json({ message: error.message });
    }
});

// 2. Parameterized routes LAST
router.get('/:userId/:otherUserId', async (req, res) => {
    try {
        const { userId, otherUserId } = req.params;

        // Verify match status
        const isMatched = await Match.findOne({
            $or: [
                { sender: userId, receiver: otherUserId, status: 'accepted' },
                { sender: otherUserId, receiver: userId, status: 'accepted' }
            ]
        });

        if (!isMatched) {
            return res.status(403).json({ message: "You can only chat after a match is accepted" });
        }

        const messages = await Message.find({
            $or: [
                { sender: userId, receiver: otherUserId },
                { sender: otherUserId, receiver: userId }
            ]
        }).sort({ createdAt: 1 });
        res.json(messages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: error.message });
    }
});

// Mark messages as read
router.put('/read/:userId/:otherUserId', async (req, res) => {
    try {
        const { userId, otherUserId } = req.params;
        await Message.updateMany(
            { sender: otherUserId, receiver: userId, read: false },
            { $set: { read: true } }
        );
        res.json({ message: 'Messages marked as read' });
    } catch (error) {
        console.error("Error marking messages as read:", error);
        res.status(500).json({ message: error.message });
    }
});

// DEBUG ONLY: Remove before production
router.get('/debug/all', async (req, res) => {
    try {
        const msgs = await Message.find().limit(10).sort({ createdAt: -1 });
        res.json(msgs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
