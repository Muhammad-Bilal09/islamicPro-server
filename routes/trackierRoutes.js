const express = require('express');
const router = express.Router();
const { processInstallPostback } = require('../controllers/trackierController');

router.post('/install', processInstallPostback);

module.exports = router;
