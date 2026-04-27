const express = require('express');
const router = express.Router();
const { 
    getMatches, 
    updateMatchStatus,
    getMatchStatus
} = require('../controllers/matchController');

router.get('/status/:userId/:targetId', getMatchStatus);
router.get('/:userId', getMatches);
router.put('/:matchId', updateMatchStatus);

module.exports = router;
