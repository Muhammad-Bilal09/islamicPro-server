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
      title: `?? ${prayerName} Prayer Time`,
      body: `It's time for ${prayerName} Prayer. Begin your Salah.`,
    },
    android: {
      priority: 'high',
      notification: {
        title: `?? ${prayerName} Prayer Time`,
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
            title: `?? ${prayerName} Prayer Time`,
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
  const dateStr = new Date().toISOString().split('T')[0];

  for (const [token, device] of userDevices.entries()) {
    try {
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

cron.schedule('0 0 * * *', () => {
  console.log('[FCM SCHEDULER] Running daily midnight prayer push calculation...');
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];

  for (const device of userDevices.values()) {
    try {
      const coordinates = new adhan.Coordinates(device.latitude, device.longitude);
      const params = adhan.CalculationMethod.Karachi();
      params.madhab = adhan.Madhab.Hanafi;

      const prayerTimes = new adhan.PrayerTimes(coordinates, today, params);
      const prayers = [
        { name: 'Fajr', time: prayerTimes.fajr },
        { name: 'Dhuhr', time: prayerTimes.dhuhr },
        { name: 'Asr', time: prayerTimes.asr },
        { name: 'Maghrib', time: prayerTimes.maghrib },
        { name: 'Isha', time: prayerTimes.isha },
      ];

      for (const prayer of prayers) {
        const delay = prayer.time.getTime() - Date.now();
        if (delay > 0) {
          setTimeout(async () => {
            await sendHighPriorityPrayerPush(device, prayer.name, dateStr);
          }, delay);
        }
      }
    } catch (err) {
      console.error(`[FCM SCHEDULER ERROR] Failed to calculate prayer times for device:`, err);
    }
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[FCM SERVER] Node.js FCM Push Backup Server running on port ${PORT}`);
});
