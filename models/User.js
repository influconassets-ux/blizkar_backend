const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long']
    },
    name: String,
    age: Number,
    gender: String,
    location: String,
    bio: String,
    occupation: String,
    religion: String,
    interests: [String],
    photos: [String],
    height: String,
    bodyType: String,
    sexuality: String,
    relationship: String,
    children: String,
    drink: String,
    smoke: String,
    drugs: String,
    intent: String,
    fantasies: [String],
    coins: {
        type: Number,
        default: 1500
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    registrationStatus: {
        type: String,
        enum: ['incomplete', 'completed'],
        default: 'incomplete'
    },
    currentStep: {
        type: String,
        default: 'Email'
    },
    blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);
