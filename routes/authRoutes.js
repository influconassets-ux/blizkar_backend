const express = require('express');
const router = express.Router();
const { register, login, savePartial } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.post('/save-partial', savePartial);

module.exports = router;
