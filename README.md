# Blizkr Backend

The robust Node.js backend for the Blizkr dating and social application. This server handles authentication, user profiles, real-time messaging, WebRTC signaling for calls, and a coin-based interaction system.

## 🚀 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js (v5+)
- **Database**: MongoDB with Mongoose
- **Real-time**: Socket.io
- **Media**: Cloudinary (Image Storage)
- **Auth**: JWT (JSON Web Tokens) & Bcryptjs
- **File Handling**: Multer

## 📋 Features

- **User Authentication**: Secure registration, login, and OTP-based verification.
- **Dynamic Profiles**: Comprehensive profile management including photos, bio, interests, and location.
- **Match System**: Gift-gated matching algorithm.
- **Real-time Chat**: Persistent messaging with read receipts, typing indicators, and media support.
- **WebRTC Signaling**: Backend support for voice and video call handshakes.
- **Notifications**: Instant socket-based notifications for likes, matches, and messages.
- **Economy System**: Coin-based transactions for sending gifts and premium interactions.

## 🛠️ Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd blizkar_backend-main
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Configuration**:
   Create a `.env` file in the root directory and add the following:
   ```env
   PORT=5001
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

4. **Run the server**:
   - **Development**: `npm run dev` (Uses nodemon and clears port 5001 automatically)
   - **Production**: `npm start`

## 📂 Project Structure

```text
├── config/             # Database and third-party service configs
├── controllers/        # Business logic for API endpoints
├── middleware/         # Auth, error handling, and file upload middleware
├── models/             # Mongoose schemas (User, Message, Match, etc.)
├── routes/             # API route definitions
├── scripts/            # Database migration and maintenance scripts
├── utils/              # Helper functions (Cloudinary, validators)
└── server.js           # Entry point & Socket.io logic
```

## 🔌 API Endpoints (Base URL: `/api`)

### Auth (`/auth`)
- `POST /register`: Initial user registration.
- `POST /verify-otp`: Verify registration OTP.
- `POST /login`: User login.

### Users (`/users`)
- `GET /profile`: Get current user profile.
- `PUT /profile`: Update profile data.
- `POST /upload-photo`: Upload photos to Cloudinary.
- `GET /nearby`: Discover users based on location.

### Chat (`/chat`)
- `GET /conversations`: List all active chats.
- `GET /history/:userId`: Fetch message history with a specific user.

### Matches & Interactions (`/matches`, `/interactions`)
- `POST /send-gift`: Initiate a match by sending a gift.
- `GET /status/:userId`: Check match status with another user.
- `PUT /accept`: Accept a pending match request.

## ⚡ Real-time Events (Socket.io)

The backend emits and listens for several key events:
- `sendMessage` / `message`: Real-time chat exchange.
- `typing` / `stopTyping`: Visual feedback in chat.
- `callUser` / `incomingCall`: WebRTC signaling.
- `onlineUsers`: Tracks user availability.

## 📜 Available Scripts

- `npm start`: Runs the server normally.
- `npm run dev`: Clears port 5001 and starts with `nodemon`.
- `npm run migrate-images`: Script to process or migrate image data.

---
© 2024 Blizkr. All rights reserved.
