const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined'],
        default: 'pending'
    },
    giftSent: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Ensure unique match between two users (optional, but good for data integrity)
// matchSchema.index({ sender: 1, receiver: 1 }, { unique: true });

module.exports = mongoose.model('Match', matchSchema);
