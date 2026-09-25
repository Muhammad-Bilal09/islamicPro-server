const firebaseAdmin = require('firebase-admin');
const { getMessaging } = require('firebase-admin/messaging');
const express = require('express');
const cron = require('node-cron');
const adhan = require('adhan');
require('dotenv').config();

const app = express();
app.use(express.json());

let serviceAccount;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  } else {
    serviceAccount = require('./service-account.json');
  }

  const { cert, initializeApp } = require('firebase-admin/app');
  initializeApp({ credential: cert(serviceAccount) });
  console.log('[FCM SERVER] Firebase Admin SDK initialized SUCCESSFULLY!');
} catch (err) {
  console.error('[FCM SERVER ERROR] Could not initialize Firebase Admin SDK. Please check service-account.json or .env config:', err.message);
}

const userDevices = new Map();

function getLocalDateString(date = new Date(), timezone = 'Asia/Karachi') {
  try {
    return new Date(date).toLocaleDateString('en-CA', { timeZone: timezone });
  } catch (_) {
    return date.toISOString().split('T')[0];
  }
}

app.post('/api/fcm/register', (req, res) => {
  const { userId, token, fcmToken, platform, latitude, longitude, timezone } = req.body;
  const targetToken = fcmToken || token;

  if (!targetToken) {
    return res.status(400).json({ error: 'fcmToken or token is required' });
  }

  const deviceData = {
    userId: userId || 'guest_user',
    fcmToken: targetToken,
    platform: (platform || 'android').toLowerCase(),
    latitude: parseFloat(latitude) || 24.8607,
    longitude: parseFloat(longitude) || 67.0011,
    timezone: timezone || 'Asia/Karachi',
    updatedAt: new Date(),
  };

  userDevices.set(targetToken, deviceData);
  console.log(`[FCM SERVER] Registered token for user ${deviceData.userId} (${deviceData.platform}) - Total tokens: ${userDevices.size}`);

  return res.json({
    success: true,
    message: 'FCM device token registered successfully.',
    registeredDevicesCount: userDevices.size,
  });
});

async function sendHighPriorityPrayerPush(device, prayerName, dateStr) {
  const identifier = `prayer-${prayerName.toLowerCase()}-${dateStr}`;

  const message = {
    token: device.fcmToken,
    data: {
      prayerName,
      identifier,
      targetTimestamp: String(Date.now()),
      title: `🕌 ${prayerName} Prayer Time`,
      body: `It's time for ${prayerName} Prayer. Begin your Salah.`,
    },
    android: {
      priority: 'high',
      notification: {
        title: `🕌 ${prayerName} Prayer Time`,
        body: `It's time for ${prayerName} Prayer. Begin your Salah.`,
        sound: 'azan',
        channelId: 'prayer_alarm_channel_v13',
        priority: 'high',
        visibility: 'public',
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          alert: {
            title: `🕌 ${prayerName} Prayer Time`,
            body: `It's time for ${prayerName} Prayer. Begin your Salah.`,
          },
          sound: 'azan.caf',
          'content-available': 1,
        },
      },
    },
  };

  try {
    const messaging = getMessaging();
    const response = await messaging.send(message);
    console.log(`[FCM SERVER SUCCESS] High-priority FCM push SENT SUCCESSFULLY for ${prayerName}! MessageID: ${response}`);
    return { success: true, messageId: response };
  } catch (error) {
    console.error(`[FCM SERVER ERROR] Failed to send ${prayerName} push to token ${device.fcmToken.substring(0, 15)}...:`, error.message);
    throw error;
  }
}

app.post('/api/fcm/test-send', async (req, res) => {
  const { prayerName = 'Test Prayer' } = req.body;
  const results = [];
  const now = new Date();

  for (const [token, device] of userDevices.entries()) {
    try {
      const dateStr = getLocalDateString(now, device.timezone);
      const resData = await sendHighPriorityPrayerPush(device, prayerName, dateStr);
      results.push({ token: token.substring(0, 15) + '...', status: 'sent', messageId: resData.messageId });
    } catch (err) {
      results.push({ token: token.substring(0, 15) + '...', status: 'failed', error: err.message });
    }
  }

  return res.json({
    message: `Test FCM push trigger executed for ${userDevices.size} devices.`,
    results,
  });
});

// Run minute-by-minute accurate push check for registered devices
cron.schedule('* * * * *', () => {
  const now = new Date();

  for (const device of userDevices.values()) {
    try {
      const deviceTz = device.timezone || 'Asia/Karachi';
      const dateStr = getLocalDateString(now, deviceTz);

      const coordinates = new adhan.Coordinates(device.latitude, device.longitude);
      const params = adhan.CalculationMethod.Karachi();
      params.madhab = adhan.Madhab.Hanafi;

      const prayerTimes = new adhan.PrayerTimes(coordinates, now, params);
      const prayers = [
        { name: 'Fajr', time: prayerTimes.fajr },
        { name: 'Dhuhr', time: prayerTimes.dhuhr },
        { name: 'Asr', time: prayerTimes.asr },
        { name: 'Maghrib', time: prayerTimes.maghrib },
        { name: 'Isha', time: prayerTimes.isha },
      ];

      for (const prayer of prayers) {
        if (!prayer.time) continue;
        const diffMs = Math.abs(now.getTime() - prayer.time.getTime());
        if (diffMs <= 60 * 1000) {
          const pushKey = `${prayer.name}-${dateStr}`;
          if (device.lastPushedPrayer !== pushKey) {
            device.lastPushedPrayer = pushKey;
            sendHighPriorityPrayerPush(device, prayer.name, dateStr).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error(`[FCM SCHEDULER ERROR] Failed to calculate prayer times:`, err.message);
    }
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[FCM SERVER] Node.js FCM Push Backup Server running on port ${PORT}`);
});
