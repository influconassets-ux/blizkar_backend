const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const db = mongoose.connection.db;
    const guni = await db.collection('users').findOne({email: 'guni@gmail.com'});
    const xyza = await db.collection('users').findOne({email: 'xyza@gmail.com'});
    
    if(!guni || !xyza) {
        console.log("Users not found", !!guni, !!xyza);
        process.exit(0);
    }
    
    const Match = db.collection('matches');
    const match = await Match.findOne({
        $or: [
            { sender: guni._id, receiver: xyza._id },
            { sender: xyza._id, receiver: guni._id }
        ]
    });
    
    console.log("Match between guni and xyza:", match);
    process.exit(0);
});
