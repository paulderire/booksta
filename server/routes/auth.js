const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

module.exports = router;