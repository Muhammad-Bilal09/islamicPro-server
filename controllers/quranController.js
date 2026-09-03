const dotenv = require('dotenv');
dotenv.config();

const QF_CLIENT_ID = process.env.QF_CLIENT_ID 
const QF_CLIENT_SECRET = process.env.QF_CLIENT_SECRET 
const QF_OAUTH_URL = process.env.QF_OAUTH_URL 
const QF_BASE_URL = process.env.QF_BASE_URL

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  try {
    const authString = Buffer.from(`${QF_CLIENT_ID}:${QF_CLIENT_SECRET}`).toString('base64');
    const bodyParams = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'content',
    });

    const response = await fetch(QF_OAUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authString}`,
      },
      body: bodyParams.toString(),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.access_token) {
        cachedToken = data.access_token;
        const expiresIn = data.expires_in || 3600;
        tokenExpiresAt = Date.now() + expiresIn * 1000;
        return cachedToken;
      }
    } else {
      const errText = await response.text();
      console.warn('[QuranProxy] Token request returned status:', response.status, errText);
    }
  } catch (err) {
    console.error('[QuranProxy] Error requesting access token:', err.message || err);
  }

  return null;
}

const proxyQuranRequest = async (req, res) => {
  try {
    const token = await getAccessToken();

    let subPath = req.params[0] || req.path || '';
    if (!subPath.startsWith('/')) {
      subPath = '/' + subPath;
    }

    const queryString = new URLSearchParams(req.query).toString();
    const targetUrl = `${QF_BASE_URL}${subPath}${queryString ? '?' + queryString : ''}`;

    const headers = {
      Accept: 'application/json',
      'x-client-id': QF_CLIENT_ID,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['x-auth-token'] = token;
    }

    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(req.body);
    }

    const apiResponse = await fetch(targetUrl, fetchOptions);
    const contentType = apiResponse.headers.get('content-type');

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.status(200);

    if (contentType && contentType.includes('application/json')) {
      const responseData = await apiResponse.json();
      return res.json(responseData);
    } else {
      const responseText = await apiResponse.text();
      return res.send(responseText);
    }
  } catch (error) {
    console.error('[QuranProxy] Proxy request error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to proxy request to Quran.Foundation API',
      error: error.message,
    });
  }
};

module.exports = {
  proxyQuranRequest,
  getAccessToken,
};
