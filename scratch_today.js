const mongoose = require('mongoose');
require('./models/User');
require('./models/Message');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Message = mongoose.model('Message');
    const start = new Date();
    start.setHours(0,0,0,0);
    const msgs = await Message.find({ createdAt: { $gte: start } }).sort({createdAt: -1}).limit(5).lean();
    console.log(JSON.stringify(msgs, null, 2));
    process.exit(0);
});
