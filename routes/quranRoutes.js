const express = require('express');
const router = express.Router();
const { proxyQuranRequest } = require('../controllers/quranController');

router.all('/{*splat}', proxyQuranRequest);

module.exports = router;
