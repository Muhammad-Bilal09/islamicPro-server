const express = require('express');
const router = express.Router();
const { registerDevice, cronCheckPrayerPush, testSendPush } = require('../controllers/fcmController');

router.post('/register', registerDevice);
router.get('/cron-check', cronCheckPrayerPush);
router.post('/cron-check', cronCheckPrayerPush);
router.post('/test-send', testSendPush);

module.exports = router;
