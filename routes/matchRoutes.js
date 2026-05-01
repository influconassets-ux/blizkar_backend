const express = require('express');
const router = express.Router();
const { 
    getMatches, 
    updateMatchStatus,
    getMatchStatus
} = require('../controllers/matchController');
const { protect } = require('../middleware/authMiddleware');

router.get('/status/:userId/:targetId', protect, getMatchStatus);
router.get('/:userId', protect, getMatches);
router.put('/:matchId', protect, updateMatchStatus);

module.exports = router;
