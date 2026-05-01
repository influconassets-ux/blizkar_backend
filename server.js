const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config({ override: true });
const PORT = process.env.PORT || 5001;

// --- PRE-FLIGHT PORT CLEARING (WINDOWS) ---
const { execSync } = require('child_process');
if (process.platform === 'win32') {
    try {
        console.log(`🔍 Elite Hunter: Checking port ${PORT}...`);
        // Find PID specifically for the listening port
        const stdout = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`).toString();
        const lines = stdout.split('\n').filter(l => l.trim());
        for (const line of lines) {
            const parts = line.trim().split(/\s+/).filter(Boolean);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(pid) && pid !== '0' && pid !== process.pid.toString()) {
                console.log(`🎯 Neutralizing process ${pid} on port ${PORT}...`);
                try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch (e) {}
            }
        }
    } catch (e) { /* Port is already free */ }
}
// ------------------------------------------

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

// Load env vars (handled at top)

// Connect to database
connectDB();

const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret']
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Routes
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/interactions', require('./routes/interactionRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/matches', require('./routes/matchRoutes'));

// Basic route
app.get('/', (req, res) => {
    res.send('API is running...');
});

// Middleware for errors
app.use(notFound);
app.use(errorHandler);

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    maxHttpBufferSize: 1e8 // 100MB
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
        const normalizedId = userId.toString();
        socket.join(normalizedId);
        socket.userId = normalizedId;
        
        if (!userSockets[normalizedId]) userSockets[normalizedId] = [];
        if (!userSockets[normalizedId].includes(socket.id)) userSockets[normalizedId].push(socket.id);
        
        console.log(`User ${normalizedId} joined room`);
        io.emit('onlineUsers', Object.keys(userSockets));
    });

    socket.on('sendMessage', async ({ sender, receiver, content, messageType, tempId }) => {
        try {
            if (!sender || !receiver || !content) return;

            const receiverUser = await User.findById(receiver);
            const senderUser = await User.findById(sender);

            // Check if blocked
            if (receiverUser && (receiverUser.blockedUsers || []).some(id => id.toString() === sender.toString())) {
                return;
            }

            const Match = mongoose.model('Match');
            let match = await Match.findOne({
                $or: [
                    { sender, receiver, status: { $in: ['accepted', 'pending'] } },
                    { sender: receiver, receiver: sender, status: { $in: ['accepted', 'pending'] } }
                ]
            });

            if (!match) {
                console.warn(`⚠️ No match found between ${sender} and ${receiver}. Status Check:`, {
                    senderId: sender,
                    receiverId: receiver
                });
                return;
            }
            console.log(`🔍 Match verified for ${sender} -> ${receiver}`);

            // Auto-accept if the receiver of the initial match/gift is replying
            if (match.status === 'pending' && match.receiver.toString() === sender.toString()) {
                match.status = 'accepted';
                await match.save();
            }

            const newMessage = new Message({
                sender,
                receiver,
                content,
                messageType: messageType || 'text',
                read: false,
                deletedBy: []
            });
            await newMessage.save();
            console.log(`✅ Message saved: Type=${messageType}, Sender=${sender}`);

            const sId = sender.toString();
            const rId = receiver.toString();
            
            // Ensure IDs are strings for the frontend
            const messagePayload = { 
                ...newMessage.toObject(), 
                _id: newMessage._id.toString(),
                sender: newMessage.sender.toString(),
                receiver: newMessage.receiver.toString(),
                tempId 
            };
            
            const roomSize = io.sockets.adapter.rooms.get(rId)?.size || 0;
            console.log(`📤 Sending to room ${rId} (Size: ${roomSize}), Content: "${content.substring(0, 10)}..."`);
            
            io.to(rId).emit('message', messagePayload);
            io.to(sId).emit('message', messagePayload);
        } catch (error) {
            console.error('❌ [Socket] CRITICAL ERROR SAVING MESSAGE:', error);
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

    // --- WebRTC Calling Logic ---
    socket.on('callUser', ({ userToCall, signalData, from, name, callType, photo }) => {
        const target = userToCall?.toString();
        const targets = new Set();
        const roomSockets = io.sockets.adapter.rooms.get(target);
        if (roomSockets) roomSockets.forEach(id => targets.add(id));
        if (userSockets[target]) userSockets[target].forEach(id => targets.add(id));

        console.log(`📞 [Socket] Call from ${from} to ${target}. Photo included: ${!!photo}`);
        targets.forEach(sid => {
            io.to(sid).emit('incomingCall', { signal: signalData, from, name, callType, photo });
        });
    });

    socket.on('answerCall', (data) => {
        const target = data.to?.toString();
        const targets = new Set();
        const roomSockets = io.sockets.adapter.rooms.get(target);
        if (roomSockets) roomSockets.forEach(id => targets.add(id));
        if (userSockets[target]) userSockets[target].forEach(id => targets.add(id));

        console.log(`✅ [Socket] Call answered. Sending to ${targets.size} unique targets`);
        targets.forEach(sid => {
            io.to(sid).emit('callAccepted', data.signal);
        });
    });

    socket.on('iceCandidate', (data) => {
        const target = data.to?.toString();
        const targets = new Set();
        const roomSockets = io.sockets.adapter.rooms.get(target);
        if (roomSockets) roomSockets.forEach(id => targets.add(id));
        if (userSockets[target]) userSockets[target].forEach(id => targets.add(id));

        targets.forEach(sid => {
            io.to(sid).emit('iceCandidate', data.candidate);
        });
    });

    socket.on('endCall', (data) => {
        const target = data?.to?.toString();
        if (!target) return;
        const targets = new Set();
        const roomSockets = io.sockets.adapter.rooms.get(target);
        if (roomSockets) roomSockets.forEach(id => targets.add(id));
        if (userSockets[target]) userSockets[target].forEach(id => targets.add(id));

        targets.forEach(sid => {
            io.to(sid).emit('endCall');
        });
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

function startServer(port) {
    server.listen(port, '0.0.0.0', () => {
        console.log(`🚀 Server LIVE on port ${port}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️ Port ${port} busy, retrying in 1s...`);
            setTimeout(() => {
                server.close();
                startServer(port);
            }, 1000);
        } else {
            console.error('Server error:', err);
        }
    });
}

startServer(PORT);

