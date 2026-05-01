const Match = require('../models/Match');
const User = require('../models/User');

// @desc    Get matches for a user based on status
// @route   GET /api/matches/:userId?status=pending|accepted|received
exports.getMatches = async (req, res) => {
    try {
        const userId = req.user._id;
        const { status } = req.query;

        let query = {};

        if (status === 'accepted') {
            // Both directions, but only accepted
            query = {
                $or: [
                    { sender: userId, status: 'accepted' },
                    { receiver: userId, status: 'accepted' }
                ]
            };
        } else if (status === 'pending') {
            // Requests I sent that are still pending
            query = { sender: userId, status: 'pending' };
        } else if (status === 'received') {
            // Requests I received that are still pending (Yet to Accept)
            query = { receiver: userId, status: 'pending' };
        } else {
            return res.status(400).json({ message: "Invalid status query" });
        }

        const matches = await Match.find(query)
            .populate('sender', '-password')
            .populate('receiver', '-password')
            .sort({ updatedAt: -1 })
            .allowDiskUse()
            .lean();

        // Transform the output to return the "other" user
        const result = matches.map(m => {
            const otherUser = m.sender._id.toString() === userId.toString() ? m.receiver : m.sender;
            return {
                matchId: m._id,
                status: m.status,
                user: otherUser,
                createdAt: m.createdAt,
                updatedAt: m.updatedAt
            };
        });

        res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching matches:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// @desc    Accept or decline a match request
// @route   PUT /api/matches/:matchId
exports.updateMatchStatus = async (req, res) => {
    try {
        const { matchId } = req.params;
        const { status } = req.body; // 'accepted' or 'declined'

        if (!['accepted', 'declined'].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const match = await Match.findById(matchId).populate('sender').populate('receiver');
        if (!match) {
            return res.status(404).json({ message: "Match request not found" });
        }

        // Only the receiver of the match request can update its status
        if (match.receiver._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "Not authorized to update this match" });
        }

        match.status = status;
        await match.save();

        // IF ACCEPTED, CREATE A SYSTEM MESSAGE
        if (status === 'accepted') {
            const Message = require('../models/Message');
            
            // The one who is currently "updating" the status is the receiver (since they received the gift)
            // But we'll make the message from the receiver to the sender as a notification
            const welcomeMsg = new Message({
                sender: match.receiver._id,
                receiver: match.sender._id,
                content: `${match.receiver.name} accepted your gift! You guys have a match! Start your chat now. ❤️`,
                messageType: 'system'
            });
            await welcomeMsg.save();

            // Emit via socket if io is available
            const io = req.app.get('io');
            if (io) {
                const sId = match.sender._id.toString();
                const rId = match.receiver._id.toString();
                io.to(sId).emit('message', welcomeMsg);
                io.to(rId).emit('message', welcomeMsg);
                
                // Also emit a special match event if frontend wants to show a popup
                io.to(sId).emit('newMatch', { otherUser: match.receiver });
                io.to(rId).emit('newMatch', { otherUser: match.sender });
            }
        }

        res.status(200).json({ message: `Match request ${status}`, match });
    } catch (error) {
        console.error("Error updating match status:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// @desc    Check match status between two users
// @route   GET /api/matches/status/:userId/:targetId
exports.getMatchStatus = async (req, res) => {
    try {
        const userId = req.user._id;
        const { targetId } = req.params;
        const match = await Match.findOne({
            $or: [
                { sender: userId, receiver: targetId },
                { sender: targetId, receiver: userId }
            ]
        });

        res.status(200).json({ 
            isMatched: match ? match.status === 'accepted' : false,
            status: match ? match.status : 'none'
        });
    } catch (error) {
        console.error("Error checking match status:", error);
        res.status(500).json({ message: "Server error" });
    }
};
