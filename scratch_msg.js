const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const db = mongoose.connection.db;
    const msgs = await db.collection('messages').find({ messageType: { $in: ['image', 'video'] } }).sort({createdAt: -1}).limit(5).toArray();
    console.log(JSON.stringify(msgs, null, 2));
    process.exit(0);
});
