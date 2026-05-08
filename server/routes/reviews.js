const express = require('express');
const { auth } = require('../middleware/auth');
const { query } = require('../db');

const router = express.Router();

function serializeReview(row) {
  return {
    id: row.id,
    book_id: row.book_id,
    user_id: row.user_id,
    user_name: row.name,
    avatar_url: row.avatar_url,
    rating: Number(row.rating),
    body: row.body,
    created_at: row.created_at
  };
}

router.get('/book/:bookId', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.id, r.book_id, r.user_id, r.rating, r.body, r.created_at, u.name, u.avatar_url
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.book_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.bookId]
    );

    res.json({ reviews: rows.map(serializeReview) });
  } catch (error) {
    next(error);
  }
});

router.post('/book/:bookId', auth, async (req, res, next) => {
  try {
    const rating = Number(req.body?.rating);
    const body = req.body?.body || null;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }

    const purchased = await query(
      `SELECT 1
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.user_id = $1 AND oi.book_id = $2
       LIMIT 1`,
      [req.user.id, req.params.bookId]
    );

    if (!purchased.rows[0]) {
      return res.status(403).json({ error: 'You must purchase the book before reviewing it.' });
    }

    const { rows } = await query(
      `INSERT INTO reviews (book_id, user_id, rating, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, book_id, user_id, rating, body, created_at`,
      [req.params.bookId, req.user.id, rating, body]
    );

    const review = rows[0];
    res.status(201).json({
      review: {
        id: review.id,
        book_id: review.book_id,
        user_id: review.user_id,
        rating: Number(review.rating),
        body: review.body,
        created_at: review.created_at
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'You have already reviewed this book.' });
    }
    next(error);
  }
});

router.patch('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM reviews WHERE id = $1', [req.params.id]);
    const review = rows[0];

    if (!review) {
      return res.status(404).json({ error: 'Review not found.' });
    }

    if (review.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const rating = req.body?.rating !== undefined ? Number(req.body.rating) : review.rating;
    const body = req.body?.body !== undefined ? req.body.body : review.body;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
    }

    const updated = await query(
      `UPDATE reviews SET rating = $1, body = $2 WHERE id = $3
       RETURNING id, book_id, user_id, rating, body, created_at`,
      [rating, body, req.params.id]
    );

    res.json({
      review: {
        id: updated.rows[0].id,
        book_id: updated.rows[0].book_id,
        user_id: updated.rows[0].user_id,
        rating: Number(updated.rows[0].rating),
        body: updated.rows[0].body,
        created_at: updated.rows[0].created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM reviews WHERE id = $1', [req.params.id]);
    const review = rows[0];

    if (!review) {
      return res.status(404).json({ error: 'Review not found.' });
    }

    if (review.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await query('DELETE FROM reviews WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;