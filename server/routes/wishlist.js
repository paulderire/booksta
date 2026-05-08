const express = require('express');
const { auth } = require('../middleware/auth');
const { query } = require('../db');
const { serializeBook } = require('../utils');

const router = express.Router();

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT w.id, w.added_at, b.*
       FROM wishlist_items w
       JOIN books b ON b.id = w.book_id
       WHERE w.user_id = $1
       ORDER BY w.added_at DESC`,
      [req.user.id]
    );

    res.json({ items: rows.map((row) => ({ id: row.id, added_at: row.added_at, book: serializeBook(row) })) });
  } catch (error) {
    next(error);
  }
});

router.post('/:bookId', async (req, res, next) => {
  try {
    const { bookId } = req.params;
    const existing = await query(
      'SELECT id FROM wishlist_items WHERE user_id = $1 AND book_id = $2',
      [req.user.id, bookId]
    );

    if (existing.rows[0]) {
      await query('DELETE FROM wishlist_items WHERE id = $1', [existing.rows[0].id]);
      return res.json({ added: false });
    }

    await query('INSERT INTO wishlist_items (user_id, book_id) VALUES ($1, $2)', [req.user.id, bookId]);
    return res.status(201).json({ added: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;