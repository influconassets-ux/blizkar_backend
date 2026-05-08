const mongoose = require('mongoose');
const { uploadBase64Image } = require('./utils/cloudinaryHelper');
require('dotenv').config();

async function migrate() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({ 'photos.0': { $exists: true } }).toArray();
    
    let updatedCount = 0;
    
    for (const user of users) {
        let changed = false;
        const newPhotos = [];
        
        for (const photo of user.photos) {
            if (photo && photo.startsWith('data:')) {
                console.log(`Migrating photo for user ${user._id}`);
                const secureUrl = await uploadBase64Image(photo);
                if (secureUrl && secureUrl.startsWith('http')) {
                    newPhotos.push(secureUrl);
                    changed = true;
                } else {
                    console.log(`Failed to migrate photo for user ${user._id}`);
                    // Drop it
                    changed = true;
                }
            } else {
                newPhotos.push(photo);
            }
        }
        
        if (changed) {
            await db.collection('users').updateOne(
                { _id: user._id },
                { $set: { photos: newPhotos } }
            );
            updatedCount++;
            console.log(`Updated user ${user._id}`);
        }
    }
    
    console.log(`Migration complete. Updated ${updatedCount} users.`);
    process.exit(0);
}

migrate().catch(err => {
    console.error(err);
    process.exit(1);
});
