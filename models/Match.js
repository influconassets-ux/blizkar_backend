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

// Compound indexes for fast lookups in both directions
matchSchema.index({ sender: 1, receiver: 1 });
matchSchema.index({ receiver: 1, sender: 1 });
matchSchema.index({ status: 1 });
matchSchema.index({ createdAt: -1 });
matchSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Match', matchSchema);
