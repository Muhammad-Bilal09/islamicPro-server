const UserDevice = require('../models/UserDevice');
const adhan = require('adhan');
const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

// Ensure Firebase Admin SDK initialized for Vercel Serverless Lambdas
if (!getApps().length) {
  try {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    } else {
      serviceAccount = require('../service-account.json');
    }

    initializeApp({ credential: cert(serviceAccount) });
    console.log('[FCM CONTROLLER] Firebase Admin SDK initialized for Vercel Serverless!');
  } catch (err) {
    console.error('[FCM CONTROLLER ERROR] Firebase Admin init error:', err.message);
  }
}

async function sendHighPriorityPush(fcmToken, prayerName, dateStr) {
  const identifier = `prayer-${prayerName.toLowerCase()}-${dateStr}`;

  const message = {
    token: fcmToken,
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

  const messaging = getMessaging();
  return await messaging.send(message);
}

// POST /api/fcm/register
exports.registerDevice = async (req, res) => {
  try {
    const { userId, token, fcmToken, platform, latitude, longitude, timezone } = req.body;
    const targetToken = fcmToken || token;

    if (!targetToken) {
      return res.status(400).json({ success: false, message: 'fcmToken or token is required' });
    }

    const filter = { fcmToken: targetToken };
    const update = {
      userId: userId || 'guest_user',
      platform: (platform || 'android').toLowerCase(),
      latitude: parseFloat(latitude) || 24.8607,
      longitude: parseFloat(longitude) || 67.0011,
      timezone: timezone || 'Asia/Karachi',
    };

    const device = await UserDevice.findOneAndUpdate(filter, update, { upsert: true, new: true });
    return res.json({ success: true, message: 'Device token registered successfully in MongoDB', device });
  } catch (error) {
    console.error('FCM Register Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/fcm/cron-check (Hit every 1-2 mins by cron-job.org or Vercel Cron)
exports.cronCheckPrayerPush = async (req, res) => {
  try {
    const devices = await UserDevice.find({});
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    let pushCount = 0;
    const details = [];

    for (const device of devices) {
      try {
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
          const diffMs = Math.abs(now.getTime() - prayer.time.getTime());
          // If within 2 minutes window of prayer time
          if (diffMs <= 2 * 60 * 1000) {
            const pushKey = `${prayer.name}-${dateStr}`;
            if (device.lastPushedPrayer !== pushKey) {
              const msgId = await sendHighPriorityPush(device.fcmToken, prayer.name, dateStr);
              device.lastPushedPrayer = pushKey;
              device.lastPushedAt = now;
              await device.save();
              pushCount++;
              details.push({ token: device.fcmToken.substring(0, 12) + '...', prayer: prayer.name, msgId });
            }
          }
        }
      } catch (devErr) {
        console.error('Error processing device for cron check:', devErr.message);
      }
    }

    return res.json({
      success: true,
      message: `Vercel Cron Check executed successfully. Sent ${pushCount} backup pushes.`,
      checkedDevicesCount: devices.length,
      pushedCount: pushCount,
      details,
    });
  } catch (error) {
    console.error('FCM Cron Check Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/fcm/test-send
exports.testSendPush = async (req, res) => {
  try {
    const { prayerName = 'Test Prayer' } = req.body;
    const devices = await UserDevice.find({});
    const results = [];
    const dateStr = new Date().toISOString().split('T')[0];

    for (const device of devices) {
      try {
        const msgId = await sendHighPriorityPush(device.fcmToken, prayerName, dateStr);
        results.push({ token: device.fcmToken.substring(0, 12) + '...', status: 'sent', messageId: msgId });
      } catch (err) {
        results.push({ token: device.fcmToken.substring(0, 12) + '...', status: 'failed', error: err.message });
      }
    }

    return res.json({
      success: true,
      message: `Test FCM push triggered for ${devices.length} devices from MongoDB.`,
      results,
    });
  } catch (error) {
    console.error('FCM Test Send Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
