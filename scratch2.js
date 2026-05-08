const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({ 'photos.0': { $exists: true } }).toArray();
    
    const nonCloudinary = users.filter(u => u.photos.some(p => !p.includes('cloudinary')));
    console.log(`Found ${nonCloudinary.length} non-cloudinary users`);
    if(nonCloudinary.length > 0) {
        console.log(JSON.stringify(nonCloudinary.map(u => ({id: u._id, photos: u.photos.map(p => p.substring(0, 50))})).slice(0, 10), null, 2));
    }
    
    process.exit(0);
});
