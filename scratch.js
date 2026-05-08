const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({ 'photos.0': { $exists: true } }).toArray();
    console.log(JSON.stringify(users.map(u => ({id: u._id, photos: u.photos})).slice(0, 10), null, 2));
    process.exit(0);
});
