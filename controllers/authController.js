const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { uploadBase64Image, processPhotos } = require('../utils/cloudinaryHelper');

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
// @desc    Register a new user (Finalize registration)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    try {
        const email = req.body.email ? req.body.email.toLowerCase().trim() : '';
        let { password, photos, ...otherDetails } = req.body;

        // Offload photos to Cloudinary
        if (photos && photos.length > 0) {
            photos = await processPhotos(photos);
        }

        // Find existing incomplete user or check if already registered
        let user = await User.findOne({ email });
        
        if (user && user.registrationStatus === 'completed') {
            return res.status(400).json({ message: 'User already exists with this email' });
        }

        // Hash password if it's new or being updated
        let hashedPassword = password;
        if (password && !password.startsWith('$2a$')) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(password, salt);
        }

        if (user) {
            // Update existing incomplete user to completed
            user = await User.findOneAndUpdate(
                { email },
                { 
                    password: hashedPassword, 
                    photos,
                    ...otherDetails, 
                    registrationStatus: 'completed',
                    currentStep: 'Done'
                },
                { new: true }
            );
        } else {
            // Create user from scratch (if partial save wasn't used)
            user = await User.create({
                email,
                password: hashedPassword,
                photos,
                ...otherDetails,
                registrationStatus: 'completed',
                currentStep: 'Done'
            });
        }

        if (user) {
            res.status(201).json({
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                token: generateToken(user._id)
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Save partial registration data
// @route   POST /api/auth/save-partial
// @access  Public
exports.savePartial = async (req, res) => {
    try {
        const email = req.body.email ? req.body.email.toLowerCase().trim() : '';
        let { password, currentStep, photos, ...details } = req.body;
        if (!email) return res.status(400).json({ message: "Email required for partial save" });

        // Offload photos to Cloudinary if they exist in this step
        if (photos && photos.length > 0) {
            photos = await processPhotos(photos);
        }

        // Check if user is already completed
        let user = await User.findOne({ email });
        if (user && user.registrationStatus === 'completed') {
            return res.status(200).json({ success: true, message: 'User already completed' });
        }

        let updateData = { ...details, photos, currentStep, registrationStatus: 'incomplete' };
        
        if (password && !password.startsWith('$2a$')) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        const updatedUser = await User.findOneAndUpdate(
            { email },
            updateData,
            { upsert: true, new: true, runValidators: false }
        );

        res.status(200).json({ success: true, step: updatedUser.currentStep });
    } catch (error) {
        console.error("Partial save error:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Check if email exists
// @route   POST /api/auth/check-email
// @access  Public
exports.checkEmail = async (req, res) => {
    try {
        const email = req.body.email ? req.body.email.toLowerCase().trim() : '';
        if (!email) return res.status(400).json({ message: "Email required" });

        const user = await User.findOne({ email });
        if (user && user.registrationStatus === 'completed') {
            return res.status(200).json({ exists: true });
        }
        res.status(200).json({ exists: false });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    try {
        const email = req.body.email ? req.body.email.toLowerCase().trim() : '';
        const { password } = req.body;

        // Find user by email
        const user = await User.findOne({ email }).lean();

        if (user && (await bcrypt.compare(password, user.password))) {
            const userResponse = { ...user };
            delete userResponse.password;
            
            res.json({
                ...userResponse,
                token: generateToken(user._id)
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Generate JWT
function generateToken(id) {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });
}
