require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { processPhotos } = require('../utils/cloudinaryHelper');

const migrate = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    console.log('Fetching all users...');
    const cursor = User.find({}).select('photos email').cursor();

    let migratedCount = 0;
    let totalChecked = 0;

    for (let user = await cursor.next(); user != null; user = await cursor.next()) {
      totalChecked++;
      if (!user.photos || user.photos.length === 0) continue;

      const hasBase64 = user.photos.some(p => typeof p === 'string' && (p.startsWith('data:image') || p.length > 1000));
      
      if (hasBase64) {
        console.log(`[${totalChecked}] Found Base64 for: ${user.email || user._id}. Migrating...`);
        try {
          const newPhotos = await processPhotos(user.photos);
          user.photos = newPhotos;
          await user.save();
          migratedCount++;
          console.log(`   ✅ Success`);
        } catch (err) {
          console.error(`   ❌ Failed:`, err.message);
        }
      }
      
      if (totalChecked % 10 === 0) {
        console.log(`Processed ${totalChecked} users...`);
      }
    }

    console.log('\n--- MIGRATION COMPLETE ---');
    console.log(`Total Checked: ${totalChecked}`);
    console.log(`Users updated: ${migratedCount}`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrate();
