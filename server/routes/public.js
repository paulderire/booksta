const express = require('express');
const { query, withTransaction } = require('../db');
const router = express.Router();

// POST /api/public/orders/anonymous
router.post('/orders/anonymous', async (req, res, next) => {
  try {
    const { bookId, quantity = 1, contactInfo = {} } = req.body || {};
    if (!bookId) return res.status(400).json({ error: 'bookId is required.' });
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const order = await withTransaction(async (client) => {
      const bookResult = await client.query(
        'SELECT id, title, author, price, stock FROM books WHERE id = $1',
        [bookId]
      );
      const book = bookResult.rows[0];
      if (!book) throw Object.assign(new Error('Book not found.'), { status: 404 });
      if (Number(book.stock) < qty) throw Object.assign(new Error('Not enough stock.'), { status: 409 });
      const total = (Number(book.price) * qty).toFixed(2);
      const anonId = 'WA-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
      const orderResult = await client.query(
        "INSERT INTO orders (user_id, total, status, anonymous_id, contact_info, channel) VALUES (NULL, $1, 'pending', $2, $3, 'whatsapp') RETURNING id, anonymous_id, total, status, created_at",
        [total, anonId, JSON.stringify(contactInfo)]
      );
      const newOrder = orderResult.rows[0];
      await client.query(
        'INSERT INTO order_items (order_id, book_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
        [newOrder.id, bookId, qty, book.price]
      );
      return {
        orderId: newOrder.id,
        trackingId: newOrder.anonymous_id,
        total: newOrder.total,
        status: newOrder.status,
        bookTitle: book.title,
        bookAuthor: book.author,
        quantity: qty,
        createdAt: newOrder.created_at
      };
    });
    res.status(201).json({ ok: true, order });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/public/orders/track/:trackingId
router.get('/orders/track/:trackingId', async (req, res, next) => {
  try {
    const { trackingId } = req.params;
    if (!trackingId || !trackingId.startsWith('WA-')) {
      return res.status(400).json({ error: 'Invalid tracking ID.' });
    }
    const { rows } = await query(
      `SELECT o.id, o.anonymous_id, o.total, o.status, o.created_at, o.channel,
        COALESCE(
          json_agg(
            json_build_object(
              'title', b.title, 'author', b.author, 'cover_url', b.cover_url,
              'quantity', oi.quantity, 'unit_price', oi.unit_price
            ) ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN books b ON b.id = oi.book_id
       WHERE o.anonymous_id = $1
       GROUP BY o.id`,
      [trackingId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Order not found.' });
    res.json({ ok: true, order: rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/featured-authors
router.get('/featured-authors', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, name, specialty, description, image_url, published_books, readers, display_order FROM featured_authors WHERE is_active = TRUE ORDER BY display_order ASC, created_at ASC'
    );
    res.json({ authors: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
