const express = require('express');
const { auth } = require('../middleware/auth');
const { query, withTransaction } = require('../db');
const { serializeBook, toNumber } = require('../utils');

const router = express.Router();

function serializeCartItem(row) {
  return {
    id: row.id,
    book: serializeBook(row),
    quantity: toNumber(row.quantity, 1),
    subtotal: toNumber(row.quantity, 1) * toNumber(row.price, 0),
    added_at: row.added_at
  };
}

router.use(auth);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ci.id, ci.quantity, ci.added_at, b.*
       FROM cart_items ci
       JOIN books b ON b.id = ci.book_id
       WHERE ci.user_id = $1
       ORDER BY ci.added_at DESC`,
      [req.user.id]
    );

    const items = rows.map(serializeCartItem);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    res.json({ items, total });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const bookId = req.body?.bookId;
    const quantity = Math.max(Number(req.body?.quantity || 1), 1);

    if (!bookId) {
      return res.status(400).json({ error: 'bookId is required.' });
    }

    const result = await withTransaction(async (client) => {
      const bookResult = await client.query('SELECT id, stock FROM books WHERE id = $1 FOR UPDATE', [bookId]);
      if (!bookResult.rows[0]) {
        return { status: 404, body: { error: 'Book not found.' } };
      }

      const existingResult = await client.query(
        'SELECT id, quantity FROM cart_items WHERE user_id = $1 AND book_id = $2 FOR UPDATE',
        [req.user.id, bookId]
      );

      const existing = existingResult.rows[0];
      const currentQuantity = existing ? Number(existing.quantity) : 0;
      const nextQuantity = currentQuantity + quantity;

      if (nextQuantity > Number(bookResult.rows[0].stock)) {
        return { status: 400, body: { error: 'Not enough stock available.' } };
      }

      let row;
      if (existing) {
        const updateResult = await client.query(
          'UPDATE cart_items SET quantity = $1 WHERE id = $2 RETURNING *',
          [nextQuantity, existing.id]
        );
        row = updateResult.rows[0];
      } else {
        const insertResult = await client.query(
          'INSERT INTO cart_items (user_id, book_id, quantity) VALUES ($1, $2, $3) RETURNING *',
          [req.user.id, bookId, nextQuantity]
        );
        row = insertResult.rows[0];
      }

      return { status: 200, body: { item: row } };
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

router.patch('/:bookId', async (req, res, next) => {
  try {
    const quantity = Number(req.body?.quantity);
    const { bookId } = req.params;

    if (Number.isNaN(quantity)) {
      return res.status(400).json({ error: 'Quantity must be a number.' });
    }

    if (quantity <= 0) {
      await query('DELETE FROM cart_items WHERE user_id = $1 AND book_id = $2', [req.user.id, bookId]);
      return res.json({ ok: true });
    }

    const bookResult = await query('SELECT stock FROM books WHERE id = $1', [bookId]);
    if (!bookResult.rows[0]) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    if (quantity > Number(bookResult.rows[0].stock)) {
      return res.status(400).json({ error: 'Not enough stock available.' });
    }

    const { rows } = await query(
      `UPDATE cart_items
       SET quantity = $1
       WHERE user_id = $2 AND book_id = $3
       RETURNING *`,
      [quantity, req.user.id, bookId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    res.json({ item: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/:bookId', async (req, res, next) => {
  try {
    await query('DELETE FROM cart_items WHERE user_id = $1 AND book_id = $2', [req.user.id, req.params.bookId]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    await query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;