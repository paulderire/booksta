const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { auth } = require('../middleware/auth');
const { query } = require('../db');
const { serializeUser } = require('../utils');

const router = express.Router();

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase());
}

function signToken(userId) {
  return jwt.sign({}, process.env.JWT_SECRET, {
    subject: userId,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
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
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

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
    return res.json({ token: signToken(user.id), user });
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

    const resetToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await query(
      `UPDATE users
       SET password_reset_token_hash = $1,
           password_reset_expires_at = $2
       WHERE email = $3`,
      [tokenHash, expiresAt, normalizedEmail]
    );

    const resetUrl = `${process.env.CLIENT_URL || ''}/#/login?resetToken=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(normalizedEmail)}`;
    res.json({
      ok: true,
      resetToken,
      resetUrl,
      message: 'Reset code generated. Use it to complete the password reset.'
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

module.exports = router;