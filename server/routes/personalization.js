const express = require('express');
const { auth } = require('../middleware/auth');
const {
  createBackInStockNotifications,
  getNotificationsForUser,
  getRecommendationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  trackReadingEvent
} = require('../personalization');
const { query } = require('../db');

const router = express.Router();

router.use(auth);

router.get('/recommendations', async (req, res, next) => {
  try {
    const limit = Math.max(Number(req.query.limit || 8), 1);
    const data = await getRecommendationsForUser(req.user.id, limit);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.get('/notifications', async (req, res, next) => {
  try {
    const limit = Math.max(Number(req.query.limit || 20), 1);
    const data = await getNotificationsForUser(req.user.id, limit);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/notifications/read-all', async (req, res, next) => {
  try {
    await markAllNotificationsRead(req.user.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/notifications/:id/read', async (req, res, next) => {
  try {
    const notification = await markNotificationRead(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/reading-events', async (req, res, next) => {
  try {
    const bookId = req.body?.bookId;
    const eventType = String(req.body?.eventType || 'view');
    const source = String(req.body?.source || 'book-detail');
    const metadata = req.body?.metadata || {};

    if (!bookId) {
      return res.status(400).json({ error: 'Book ID is required.' });
    }

    const event = await trackReadingEvent(req.user.id, bookId, eventType, source, metadata);
    res.status(201).json({ event });
  } catch (error) {
    next(error);
  }
});

router.post('/notifications/check-restock', async (req, res, next) => {
  try {
    const { bookId, previousStock, nextStock } = req.body || {};
    if (!bookId) {
      return res.status(400).json({ error: 'Book ID is required.' });
    }

    const { rows } = await query('SELECT * FROM books WHERE id = $1', [bookId]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    const result = await createBackInStockNotifications(rows[0], previousStock, nextStock);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
