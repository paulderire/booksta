const jwt = require('jsonwebtoken');
const { query } = require('../db');

function getToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    // Try cookie fallback (simple parse) for 'booksta_token' or 'token'
    const cookieHeader = req.headers.cookie || '';
    const cookies = cookieHeader.split(/;\s*/).reduce((acc, pair) => {
      const [k, v] = pair.split('=');
      if (k && v) acc[k.trim()] = decodeURIComponent(v.trim());
      return acc;
    }, {});
    return cookies.booksta_token || cookies.token || null;
  }
  return token;
}

async function auth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await query(
      'SELECT id, name, email, avatar_url, role, created_at FROM users WHERE id = $1',
      [payload.sub]
    );

    if (!rows[0]) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

module.exports = {
  auth,
  requireAdmin
};