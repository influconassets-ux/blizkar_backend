const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Message = mongoose.model('Message');
const User = mongoose.model('User');
const Match = mongoose.model('Match');

const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

const storage = multer.memoryStorage();
const upload = multer({ storage });

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { protect } = require('../middleware/authMiddleware');

// 0. Upload Route for Media (WhatsApp-Style UNBREAKABLE Logic)
router.post('/upload', protect, upload.single('file'), async (req, res) => {
    let tempFilePath = null;
    let fileBase64 = null;
    try {
        if (!req.file) {
            console.error('❌ Upload Error: No file found in the request');
            return res.status(400).json({ error: 'No file provided' });
        }

        const { type } = req.body; 
        const resourceType = (type === 'audio' || type === 'video') ? 'video' : 'image';
        
        console.log(`🎤 Receiving ${type} upload... Size: ${Math.round(req.file.size / 1024)} KB`);

        // Prepare Base64 as a FAIL-SAFE "Another Logic"
        const cleanMimeType = req.file.mimetype.split(';')[0];
        fileBase64 = `data:${cleanMimeType};base64,${req.file.buffer.toString('base64')}`;

        // Create a temporary file for Cloudinary
        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, `upload_${Date.now()}_${req.file.originalname || 'file'}`);
        await fs.writeFile(tempFilePath, req.file.buffer);

        // Try Priority 1: Cloudinary (Primary for Video)
        try {
            const result = await cloudinary.uploader.upload(tempFilePath, {
                resource_type: resourceType,
                folder: 'blikzr_chat',
                chunk_size: 6000000, // 6MB chunks for large videos
                eager: [
                    { width: 300, height: 300, crop: "pad", audio_codec: "none" }
                ],
                eager_async: true
            });
            console.log('✅ Cloudinary Upload Successful:', result.secure_url);
            if (tempFilePath) await fs.remove(tempFilePath);
            return res.json({ url: result.secure_url });
        } catch (cloudinaryError) {
            console.warn('⚠️ Cloudinary Failed:', cloudinaryError.message);
            if (tempFilePath) await fs.remove(tempFilePath);
            
            // For Video, if Cloudinary fails, we ONLY return base64 if it's small enough for the DB (< 14MB)
            if (req.file.size < 14 * 1024 * 1024) {
                return res.json({ url: fileBase64, isFailSafe: true });
            } else {
                return res.status(500).json({ error: 'Video too large for backup storage. Please try again when Cloudinary is active.' });
            }
        }

    } catch (error) {
        console.error('❌ CRITICAL UPLOAD ERROR:', error);
        if (tempFilePath) {
            try { await fs.remove(tempFilePath); } catch (e) {}
        }
        // Last resort: return base64 if we have it
        if (fileBase64) {
            return res.json({ url: fileBase64, isFailSafe: true });
        }
        res.status(500).json({ error: 'All upload methods failed' });
    }
});

// 1. Admin Routes (Prioritize these)
router.get('/admin/conversations/:userId', protect, async (req, res) => {
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

router.get('/admin/history/:userId/:otherUserId', protect, async (req, res) => {
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

router.get('/conversations/:userId', protect, async (req, res) => {
    const start = Date.now();
    try {
        const userId = req.user._id.toString();

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        const messages = await Message.aggregate([
            {
                $match: {
                    $and: [
                        {
                            $or: [
                                { sender: new mongoose.Types.ObjectId(userId) },
                                { receiver: new mongoose.Types.ObjectId(userId) }
                            ]
                        },
                        { $expr: { $ne: ["$sender", "$receiver"] } },
                        {
                            $or: [
                                { deletedBy: { $exists: false } },
                                { deletedBy: { $size: 0 } },
                                { deletedBy: { $nin: [userId, new mongoose.Types.ObjectId(userId)] } }
                            ]
                        }
                    ]
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$sender", new mongoose.Types.ObjectId(userId)] },
                            "$receiver",
                            "$sender"
                        ]
                    },
                    lastMessage: { $first: "$$ROOT" }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "otherUser"
                }
            },
            { $unwind: "$otherUser" },
            {
                $lookup: {
                    from: "messages",
                    let: { otherId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$sender", "$$otherId"] },
                                        { $eq: ["$receiver", new mongoose.Types.ObjectId(userId)] },
                                        { $eq: ["$read", false] }
                                    ]
                                }
                            }
                        },
                        { $count: "count" }
                    ],
                    as: "unread"
                }
            },
            {
                $project: {
                    _id: 0,
                    userId: "$_id",
                    name: "$otherUser.name",
                    photos: "$otherUser.photos",
                    img: { $arrayElemAt: ["$otherUser.photos", 0] },
                    unreadCount: { $ifNull: [{ $arrayElemAt: ["$unread.count", 0] }, 0] },
                    lastMsg: {
                        $cond: [
                            { $eq: ["$lastMessage.messageType", "image"] },
                            "📷 Photo",
                            {
                                $cond: [
                                    { $eq: ["$lastMessage.messageType", "audio"] },
                                    "🎤 Voice Note",
                                    {
                                        $cond: [
                                            { $eq: ["$lastMessage.messageType", "video"] },
                                            "🎥 Video",
                                            {
                                                $cond: [
                                                  { $eq: ["$lastMessage.messageType", "gift"] },
                                                  "🎁 Gift",
                                                  "$lastMessage.content"
                                                ]
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },
                    createdAt: "$lastMessage.createdAt",
                    read: "$lastMessage.read",
                    lastSender: "$lastMessage.sender"
                }
            },
            { $sort: { createdAt: -1 } }
        ]).allowDiskUse();

        console.log(`[Conversations] Aggregation finished. User: ${userId}, Results: ${messages.length}`);
        if (messages.length > 0) {
            console.log(`[Conversations] Last Msg in first convo: "${messages[0].lastMsg}", Sender: ${messages[0].lastSender}`);
        }

        console.log(`⏱️ Conversations Load: ${Date.now() - start}ms for ${messages.length} convos`);
        res.json(messages);
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ message: error.message });
    }
});

router.get('/new-matches/:userId', protect, async (req, res) => {
    try {
        const userId = req.user._id;

        // 1. Get all accepted matches
        const matches = await Match.find({
            $or: [
                { sender: userId, status: 'accepted' },
                { receiver: userId, status: 'accepted' }
            ]
        });

        const matchedUserIds = matches.map(m => 
            m.sender.toString() === userId.toString() ? m.receiver.toString() : m.sender.toString()
        );

        // 2. Find which of these users have NO messages with the current user
        const newMatches = [];
        for (const otherUserId of matchedUserIds) {
            const messageCount = await Message.countDocuments({
                $or: [
                    { sender: userId, receiver: otherUserId },
                    { sender: otherUserId, receiver: userId }
                ],
                deletedBy: { $nin: [userId, new mongoose.Types.ObjectId(userId)] }
            });

            if (messageCount === 0) {
                const user = await User.findById(otherUserId).select('name photos');
                if (user) {
                    newMatches.push({
                        userId: user._id,
                        name: user.name,
                        img: user.photos?.[0] || 'https://i.pravatar.cc/150'
                    });
                }
            }
        }

        res.json(newMatches);
    } catch (error) {
        console.error("Error fetching new matches:", error);
        res.status(500).json({ message: error.message });
    }
});


router.get('/unread-count/:userId', protect, async (req, res) => {
    try {
        const userId = req.user._id;
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

router.get('/unread-senders/:userId', protect, async (req, res) => {
    try {
        const userId = req.user._id;
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
router.get('/:userId/:otherUserId', protect, async (req, res) => {
    const start = Date.now();
    try {
        const { otherUserId } = req.params;
        const userId = req.user._id.toString();

        // Explicitly cast to ObjectId for maximum index performance
        const userObjId = req.user._id;
        const otherUserObjId = new mongoose.Types.ObjectId(otherUserId.trim().substring(0, 24));

        let { limit = 50, before } = req.query;
        limit = parseInt(limit);

        const baseQuery = before ? { createdAt: { $lt: new Date(before) } } : {};

        // FINAL BOSS OPTIMIZATION: Use Aggregation with $strLenCP to truncate content ON THE DATABASE SIDE.
        // This prevents massive base64 strings from ever being transferred to Node, fixing the 86s lag.
        const query = {
            ...baseQuery,
            $or: [
                { sender: userObjId, receiver: otherUserObjId },
                { sender: otherUserObjId, receiver: userObjId }
            ],
            deletedBy: { $nin: [userId, userObjId] }
        };

        const messages = await Message.aggregate([
            { $match: query },
            { $sort: { createdAt: -1 } },
            { $limit: limit },
            {
                $project: {
                    _id: 1,
                    sender: 1,
                    receiver: 1,
                    messageType: 1,
                    createdAt: 1,
                    read: 1,
                    // SMART TRUNCATION: Always show URLs (fast), only truncate Base64 (slow)
                    content: {
                        $cond: [
                            { $and: [
                                { $not: [{ $regexMatch: { input: { $ifNull: ["$content", ""] }, regex: "^http" } }] },
                                { $gt: [{ $strLenBytes: { $ifNull: ["$content", ""] } }, 1000] },
                                { $ne: ["$messageType", "text"] }
                            ]},
                            "", 
                            "$content"
                        ]
                    },
                    isTruncated: {
                        $cond: [
                            { $and: [
                                { $not: [{ $regexMatch: { input: { $ifNull: ["$content", ""] }, regex: "^http" } }] },
                                { $gt: [{ $strLenBytes: { $ifNull: ["$content", ""] } }, 1000] },
                                { $ne: ["$messageType", "text"] }
                            ]},
                            true,
                            false
                        ]
                    }
                }
            }
        ]).allowDiskUse();
        
        const processedMessages = messages.reverse();

        console.log(`⏱️ History Load: ${Date.now() - start}ms for ${processedMessages.length} msgs (DB-side Truncation Active)`);
        res.json(processedMessages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: error.message });
    }
});

// Mark messages as read
router.put('/read/:userId/:otherUserId', protect, async (req, res) => {
    try {
        const { otherUserId } = req.params;
        const userId = req.user._id;
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

// 3. Delete Conversation
router.delete('/conversation/:userId/:otherUserId', protect, async (req, res) => {
    try {
        const { otherUserId: rawOtherUserId } = req.params;
        const userId = req.user._id.toString();
        const otherUserId = rawOtherUserId.trim().substring(0, 24);

        if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(otherUserId)) {
            return res.status(400).json({ message: "Invalid user IDs" });
        }

        await Message.deleteMany({
            $or: [
                { sender: userId, receiver: otherUserId },
                { sender: otherUserId, receiver: userId }
            ]
        });

        res.json({ success: true, message: "Conversation deleted successfully" });
    } catch (error) {
        console.error("Error deleting conversation:", error);
        res.status(500).json({ message: error.message });
    }
});

// Clear Chat (Soft Delete)
router.post('/clear/:userId/:otherUserId', protect, async (req, res) => {
    try {
        const { otherUserId } = req.params;
        const userId = req.user._id.toString();
        const userObjId = req.user._id;
        const otherUserObjId = new mongoose.Types.ObjectId(otherUserId.trim().substring(0, 24));

        // Add user to deletedBy array for all messages in this conversation
        await Message.updateMany(
            {
                $or: [
                    { sender: userObjId, receiver: otherUserObjId },
                    { sender: otherUserObjId, receiver: userObjId }
                ],
                deletedBy: { $ne: userObjId }
            },
            { $addToSet: { deletedBy: userObjId } }
        );

        res.json({ success: true, message: "Chat cleared successfully" });
    } catch (error) {
        console.error("Error clearing chat:", error);
        res.status(500).json({ message: error.message });
    }
});

// 3. Single message fetch (for truncated content)
router.get('/message/:messageId', protect, async (req, res) => {
    try {
        const { messageId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ message: "Invalid message ID" });
        }
        const message = await Message.findById(messageId).lean();
        if (!message) return res.status(404).json({ message: "Message not found" });
        res.json(message);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
