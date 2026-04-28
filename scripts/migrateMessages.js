require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const { uploadToCloudinary } = require('../utils/cloudinaryHelper');

const migrate = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected!');

        console.log('Fetching all media messages...');
        const messages = await Message.find({
            messageType: { $ne: 'text' }
        });

        console.log(`Found ${messages.length} media messages. Checking for base64...`);

        let migratedCount = 0;
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            
            const isBase64 = msg.content && (msg.content.startsWith('data:') || msg.content.length > 1000);
            
            if (isBase64) {
                console.log(`[${i+1}/${messages.length}] Migrating heavy ${msg.messageType}...`);
                try {
                    let buffer;
                    if (msg.content.startsWith('data:')) {
                        const base64Data = msg.content.split(',')[1];
                        buffer = Buffer.from(base64Data, 'base64');
                    } else {
                        // It's a huge raw string?
                        buffer = Buffer.from(msg.content, 'base64');
                    }
                    
                    const url = await uploadToCloudinary(buffer, msg.messageType);
                    
                    if (url) {
                        msg.content = url;
                        await msg.save();
                        migratedCount++;
                        console.log(`   ✅ Success: ${url}`);
                    }
                } catch (err) {
                    console.error(`   ❌ Failed:`, err.message);
                }
            }
        }

        console.log(`\n--- MIGRATION COMPLETE ---`);
        console.log(`Migrated: ${migratedCount} messages`);
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
