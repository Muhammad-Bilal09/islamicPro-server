const TrackierInstall = require('../models/TrackierInstall');
const { isConnected } = require('../config/db');
const fs = require('fs');
const path = require('path');

// Fallback local file storage if MongoDB is not connected
const LOCAL_DB_PATH = path.join(__dirname, '../data/trackier_installs.json');

const getLocalInstalls = () => {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf-8'));
    }
  } catch (_) {}
  return [];
};

const saveLocalInstall = (record) => {
  try {
    const dir = path.dirname(LOCAL_DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const installs = getLocalInstalls();
    installs.push(record);
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(installs, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Trackier] Failed to write local fallback record:', err.message);
  }
};

/**
 * POST /api/trackier/install
 * Receives click_id from mobile app, validates it, checks for duplicates,
 * makes S2S HTTP GET request to Trackier, stores attribution record, and returns response.
 */
exports.processInstallPostback = async (req, res) => {
  try {
    console.log('[Trackier] Install request received');

    const { click_id } = req.body || {};

    // Validate click_id
    if (!click_id || typeof click_id !== 'string' || click_id.trim().length === 0) {
      console.warn('[Trackier] Validation failed: click_id is missing or empty');
      return res.status(400).json({
        success: false,
        message: 'click_id is required',
      });
    }

    const cleanClickId = click_id.trim();
    console.log('[Trackier] click_id validated');

    // Prevent duplicate processing for the same click_id
    let existingRecord = null;
    if (isConnected()) {
      existingRecord = await TrackierInstall.findOne({ clickId: cleanClickId });
    } else {
      const localInstalls = getLocalInstalls();
      existingRecord = localInstalls.find((item) => item.clickId === cleanClickId);
    }

    if (existingRecord) {
      console.log(`[Trackier] Duplicate install request ignored for click_id: ${cleanClickId}`);
      return res.status(200).json({
        success: true,
        message: 'Trackier install already processed',
      });
    }

    // Construct Trackier S2S postback URL
    const postbackBaseUrl =
      process.env.TRACKIER_POSTBACK_URL || 'https://medialinks4.trackier.co/acquisition';
    const securityToken =
      process.env.TRACKIER_SECURITY_TOKEN || 'cf4714ea9bd5447bca6a';

    const encodedClickId = encodeURIComponent(cleanClickId);
    const targetUrl = `${postbackBaseUrl}?click_id=${encodedClickId}&security_token=${encodeURIComponent(securityToken)}`;

    console.log('[Trackier] Calling Trackier postback');
    const startTime = Date.now();

    let trackierStatus = 500;
    let trackierResponseBody = '';
    let isSuccess = false;
    let errorInfo = null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'IslamicPro-Server/1.0',
          Accept: 'application/json, text/plain, */*',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      trackierStatus = response.status;
      trackierResponseBody = await response.text();
      isSuccess = response.ok;

      console.log(`[Trackier] Trackier response status: ${trackierStatus}`);
    } catch (fetchErr) {
      const duration = Date.now() - startTime;
      errorInfo = fetchErr.name === 'AbortError' ? 'Request timeout (10s)' : fetchErr.message;
      console.error(`[Trackier] Trackier HTTP call error after ${duration}ms:`, errorInfo);
    }

    const durationMs = Date.now() - startTime;

    // Record attribution details in DB or fallback
    const recordData = {
      clickId: cleanClickId,
      status: isSuccess ? 'success' : 'failed',
      processedAt: new Date(),
      trackierResponseStatus: trackierStatus,
      trackierResponseBody: trackierResponseBody.substring(0, 1000),
      requestDurationMs: durationMs,
      errorMessage: errorInfo || (isSuccess ? null : `HTTP Status ${trackierStatus}`),
    };

    if (isConnected()) {
      try {
        await TrackierInstall.create(recordData);
      } catch (dbErr) {
        console.error('[Trackier] Error saving to MongoDB:', dbErr.message);
      }
    } else {
      saveLocalInstall(recordData);
    }

    if (isSuccess) {
      console.log('[Trackier] Trackier conversion processed');
      return res.status(200).json({
        success: true,
        message: 'Trackier install processed',
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to process Trackier postback',
      });
    }
  } catch (error) {
    console.error('[Trackier] Internal server error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
