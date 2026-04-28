require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('../models/Message');

const fix = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        const result = await Message.updateMany(
            { deletedBy: { $exists: false } },
            { $set: { deletedBy: [] } }
        );

        console.log(`Fixed ${result.modifiedCount} messages with missing deletedBy field.`);
        process.exit(0);
    } catch (error) {
        console.error('Fix failed:', error);
        process.exit(1);
    }
};

fix();
