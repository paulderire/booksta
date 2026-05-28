const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const dns = require('dns');
const nodemailer = require('nodemailer');
const { auth } = require('../middleware/auth');
const { query } = require('../db');
const { serializeUser } = require('../utils');

const router = express.Router();

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase());
}

function signToken(userId, expiresIn) {
  const exp = expiresIn || process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: userId,
    expiresIn: exp
  });
}

function parseExpiryToMs(expiry) {
  if (!expiry) return 0;
  const match = String(expiry).trim().toLowerCase().match(/^(\d+)(d|h|m|s)?$/);
  if (!match) return 0;
  const n = Number(match[1]);
  const unit = match[2] || 'd';
  switch (unit) {
    case 'd': return n * 24 * 60 * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'm': return n * 60 * 1000;
    case 's': return n * 1000;
    default: return n * 24 * 60 * 60 * 1000;
  }
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function formatFromAddress(fromValue) {
  const raw = String(fromValue || '').trim();
  if (!raw) {
    return raw;
  }

  if (raw.includes('<') && raw.includes('>')) {
    return raw;
  }

  return `"Booksta" <${raw}>`;
}

function resolveHostIPv4(hostname) {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { family: 4 }, (err, address) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(address);
    });
  });
}

async function getSmtpConfig() {
  const keys = ['smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass', 'smtpFrom', 'clientUrl'];
  const { rows } = await query('SELECT key, value FROM app_settings WHERE key = ANY($1)', [keys]);
  const map = rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  const host = map.smtpHost || process.env.SMTP_HOST;
  const port = Number(map.smtpPort || process.env.SMTP_PORT || 465);
  const user = map.smtpUser || process.env.SMTP_USER;
  const pass = map.smtpPass || process.env.SMTP_PASS;
  const secure = String(map.smtpSecure || process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const from = map.smtpFrom || process.env.SMTP_FROM || user;
  const clientUrl = map.clientUrl || process.env.CLIENT_URL || 'http://localhost:5000';

  if (!host || !user || !pass || !from) {
    return null;
  }

  return { host, port, user, pass, secure, from, clientUrl };
}

async function createTransporter(config) {
  let smtpHost = config.host;
  try {
    smtpHost = await resolveHostIPv4(config.host);
  } catch (err) {
    console.warn('smtp-ipv4-lookup-failed', { host: config.host, error: err && err.message ? err.message : String(err) });
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: config.port,
    secure: config.secure,
    family: 4,
    auth: {
      user: config.user,
      pass: config.pass
    },
    tls: {
      // Keep TLS validation aligned with the original SMTP host when we connect by IPv4 address.
      servername: config.host
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });
}

async function sendResetPasswordEmail({ toEmail, resetToken }) {
  const smtpConfig = await getSmtpConfig();
  if (!smtpConfig) {
    const err = new Error('Email delivery is not configured on the server. Please configure SMTP in Admin Settings.');
    err.status = 500;
    throw err;
  }

  const transporter = await createTransporter(smtpConfig);
  try {
    await transporter.sendMail({
      from: formatFromAddress(smtpConfig.from),
      to: toEmail,
      subject: 'Booksta 6-digit password reset code',
      text: `Your Booksta reset code is: ${resetToken}\n\nUse this 6-digit code to reset your password.\n\nThis code expires in 30 minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111;max-width:600px;">
          <h2>Reset your Booksta password</h2>
          <p>Your reset code is:</p>
          <p style="font-size:20px;font-weight:700;letter-spacing:1px;">${resetToken}</p>
          <p>This code expires in 30 minutes.</p>
        </div>
      `
    });
  } catch (err) {
    console.error('smtp-send-failed', {
      code: err && err.code ? err.code : null,
      syscall: err && err.syscall ? err.syscall : null,
      address: err && err.address ? err.address : null,
      port: err && err.port ? err.port : smtpConfig.port,
      message: err && err.message ? err.message : String(err)
    });

    const sendErr = new Error('Could not send reset code email. Please verify SMTP settings in Admin.');
    sendErr.status = 500;
    throw sendErr;
  }
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);

    if (existing.rows[0]) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const passwordHash = await bcrypt.hash(password, rounds);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, avatar_url, role, created_at`,
      [name.trim(), normalizedEmail, passwordHash]
    );

    const user = serializeUser(rows[0]);
    return res.status(201).json({ token: signToken(user.id), user });
  } catch (error) {
    console.error('forgot-password-failed', error && error.stack ? error.stack : error);
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password, remember } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { rows } = await query(
      'SELECT id, name, email, avatar_url, role, password_hash, created_at FROM users WHERE email = $1',
      [String(email).toLowerCase().trim()]
    );

    if (!rows[0]) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const isValid = await bcrypt.compare(password, rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = serializeUser(rows[0]);

    const expiresIn = remember ? (process.env.JWT_REMEMBER_EXPIRES_IN || '30d') : (process.env.JWT_EXPIRES_IN || '7d');
    const token = signToken(user.id, expiresIn);

    // If the client requested to be remembered, set an HttpOnly cookie
    if (remember) {
      const maxAge = parseExpiryToMs(expiresIn) || (30 * 24 * 60 * 60 * 1000);
      res.cookie('booksta_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge
      });
    }

    return res.json({ token, user });
  } catch (error) {
    next(error);
  }
});

router.get('/me', auth, async (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

router.patch('/me', auth, async (req, res, next) => {
  try {
    const { name, avatar_url: avatarUrl } = req.body || {};
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push(`name = $${updates.length + 1}`);
      values.push(String(name).trim());
    }

    if (avatarUrl !== undefined) {
      updates.push(`avatar_url = $${updates.length + 1}`);
      values.push(avatarUrl || null);
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'No profile fields were provided.' });
    }

    values.push(req.user.id);
    const { rows } = await query(
      `UPDATE users SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING id, name, email, avatar_url, role, created_at`,
      values
    );

    res.json({ user: serializeUser(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.post('/change-password', auth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const isValid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const passwordHash = await bcrypt.hash(newPassword, rounds);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const { rows } = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);

    if (!rows[0]) {
      return res.status(404).json({ error: 'No account found for that email.' });
    }

    const resetToken = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const tokenHash = hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await query(
      `UPDATE users
       SET password_reset_token_hash = $1,
           password_reset_expires_at = $2
       WHERE email = $3`,
      [tokenHash, expiresAt, normalizedEmail]
    );

    await sendResetPasswordEmail({ toEmail: normalizedEmail, resetToken });

    res.json({
      ok: true,
      message: 'Reset code sent to your email. Please check your inbox.'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, token, newPassword } = req.body || {};

    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: 'Email, token, and new password are required.' });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    if (!/^\d{6}$/.test(String(token || '').trim())) {
      return res.status(400).json({ error: 'Password reset code must be exactly 6 digits.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const tokenHash = hashResetToken(token);
    const { rows } = await query(
      `SELECT id, password_reset_expires_at, password_reset_token_hash
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    const user = rows[0];
    if (!user || !user.password_reset_token_hash) {
      return res.status(400).json({ error: 'Password reset code is invalid or has expired.' });
    }

    if (new Date(user.password_reset_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Password reset code is invalid or has expired.' });
    }

    if (user.password_reset_token_hash !== tokenHash) {
      return res.status(400).json({ error: 'Password reset code is invalid or has expired.' });
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
    const passwordHash = await bcrypt.hash(newPassword, rounds);
    await query(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token_hash = NULL,
           password_reset_expires_at = NULL
       WHERE email = $2`,
      [passwordHash, normalizedEmail]
    );

    res.json({ ok: true, message: 'Password updated successfully.' });
  } catch (error) {
    next(error);
  }
});

// Logout endpoint to clear remember-me cookie
router.post('/logout', (req, res) => {
  try {
    res.clearCookie('booksta_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not clear session cookie.' });
  }
});

module.exports = router;