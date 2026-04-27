const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');

const interactionRoutes = require('./routes/interactionRoutes');

// Pre-load models to register them with Mongoose
require('./models/User');
require('./models/Message');
require('./models/Notification');
require('./models/Transaction');
require('./models/Match');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Request Logger
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/interactions', require('./routes/interactionRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/matches', require('./routes/matchRoutes'));

// Basic route
app.get('/', (req, res) => {
    res.send('API is running...');
});

// Error Handler
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ message: "The data you're sending is too large (likely the photos). Please try with smaller images." });
    }
    console.error(err.stack);
    res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Make io accessible to controllers
app.set('io', io);

const Message = require('./models/Message');
const User = require('./models/User');

// Socket.io connection logic
const userSockets = {}; // { userId: [socketId1, socketId2] }

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', (userId) => {
        if (!userId) return;
        socket.join(userId);
        socket.userId = userId;
        
        if (!userSockets[userId]) userSockets[userId] = [];
        if (!userSockets[userId].includes(socket.id)) userSockets[userId].push(socket.id);
        
        console.log(`User ${userId} joined room`);
        io.emit('onlineUsers', Object.keys(userSockets));
    });

    socket.on('sendMessage', async ({ sender, receiver, content, messageType }) => {
        try {
            if (!sender || !receiver || !content) return;

            const receiverUser = await User.findById(receiver);
            const senderUser = await User.findById(sender);

            // Check if blocked
            if (receiverUser && (receiverUser.blockedUsers || []).some(id => id.toString() === sender.toString())) {
                console.log(`[Socket] Blocked: ${sender} -> ${receiver} (Receiver blocked sender)`);
                return;
            }
            if (senderUser && (senderUser.blockedUsers || []).some(id => id.toString() === receiver.toString())) {
                console.log(`[Socket] Blocked: ${sender} -> ${receiver} (Sender blocked receiver)`);
                return;
            }

            // Check if matched
            const Match = mongoose.model('Match');
            const match = await Match.findOne({
                $or: [
                    { sender, receiver, status: 'accepted' },
                    { sender: receiver, receiver: sender, status: 'accepted' }
                ]
            });

            if (!match) {
                console.log(`[Socket] Rejected: ${sender} -> ${receiver} (Not matched)`);
                return;
            }

            const newMessage = new Message({
                sender,
                receiver,
                content,
                messageType: messageType || 'text',
                read: false
            });
            await newMessage.save();

            console.log(`[Socket] Message Sent: ${sender} -> ${receiver}`);

            const sId = sender.toString();
            const rId = receiver.toString();
            
            // Emit message to receiver and sender separately for maximum reliability
            io.to(rId).emit('message', newMessage);
            io.to(sId).emit('message', newMessage);
        } catch (error) {
            console.error('[Socket] Error sending message:', error);
        }
    });

    socket.on('markRead', ({ senderId, receiverId }) => {
        // When receiver (currentUser) marks messages as read, notify the sender
        io.to(senderId).emit('messagesRead', { readerId: receiverId });
    });

    socket.on('typing', ({ senderId, receiverId }) => {
        io.to(receiverId).emit('userTyping', { senderId });
    });

    socket.on('stopTyping', ({ senderId, receiverId }) => {
        io.to(receiverId).emit('userStopTyping', { senderId });
    });

    socket.on('blockUpdate', ({ senderId, receiverId }) => {
        io.to(receiverId).emit('blockStatusChanged', { senderId });
    });

    socket.on('disconnect', () => {
        const userId = socket.userId;
        if (userId && userSockets[userId]) {
            userSockets[userId] = userSockets[userId].filter(id => id !== socket.id);
            if (userSockets[userId].length === 0) {
                delete userSockets[userId];
            }
        }
        io.emit('onlineUsers', Object.keys(userSockets));
        console.log('User disconnected');
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

