const express = require('express');
const { auth } = require('../middleware/auth');
const { query, withTransaction } = require('../db');
const { serializeOrder } = require('../utils');

const router = express.Router();

router.use(auth);

async function fetchOrderById(userId, orderId) {
  const { rows } = await query(
    `SELECT
      o.id,
      o.user_id,
      o.total,
      o.status,
      o.shipping_address,
      o.created_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id,
            'book_id', oi.book_id,
            'title', b.title,
            'author', b.author,
            'cover_url', b.cover_url,
            'cover_color', b.cover_color,
            'emoji', b.emoji,
            'quantity', oi.quantity,
            'unit_price', oi.unit_price
          )
          ORDER BY oi.id
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'::json
      ) AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN books b ON b.id = oi.book_id
     WHERE o.user_id = $1 AND o.id = $2
     GROUP BY o.id`,
    [userId, orderId]
  );

  return rows[0] ? serializeOrder(rows[0]) : null;
}

router.post('/', async (req, res, next) => {
  try {
    const shippingAddress = req.body?.shippingAddress;
    if (!shippingAddress || !shippingAddress.line1 || !shippingAddress.city || !shippingAddress.country || !shippingAddress.postalCode) {
      return res.status(400).json({ error: 'Complete shipping address is required.' });
    }

    const order = await withTransaction(async (client) => {
      const cartResult = await client.query(
        `SELECT ci.id AS cart_item_id, ci.book_id, ci.quantity, b.title, b.price, b.stock
         FROM cart_items ci
         JOIN books b ON b.id = ci.book_id
         WHERE ci.user_id = $1
         ORDER BY ci.added_at ASC`,
        [req.user.id]
      );

      if (!cartResult.rows.length) {
        throw Object.assign(new Error('Cart is empty.'), { status: 400 });
      }

      for (const item of cartResult.rows) {
        if (Number(item.quantity) > Number(item.stock)) {
          throw Object.assign(new Error(`Not enough stock for ${item.title}.`), { status: 400 });
        }
      }

      const total = cartResult.rows.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);

      const orderResult = await client.query(
        `INSERT INTO orders (user_id, total, status, shipping_address)
         VALUES ($1, $2, 'pending', $3)
         RETURNING *`,
        [req.user.id, total, shippingAddress]
      );

      const orderRow = orderResult.rows[0];
      const orderItems = [];

      for (const item of cartResult.rows) {
        const inserted = await client.query(
          `INSERT INTO order_items (order_id, book_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [orderRow.id, item.book_id, item.quantity, item.price]
        );
        orderItems.push(inserted.rows[0]);

        await client.query(
          'UPDATE books SET stock = stock - $1 WHERE id = $2',
          [item.quantity, item.book_id]
        );
      }

      await client.query('DELETE FROM cart_items WHERE user_id = $1', [req.user.id]);

      return { ...orderRow, items: orderItems.map((item) => ({
        id: item.id,
        book_id: item.book_id,
        quantity: item.quantity,
        unit_price: item.unit_price
      })) };
    });

    res.status(201).json({ order: serializeOrder(order) });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        o.id,
        o.user_id,
        o.total,
        o.status,
        o.shipping_address,
        o.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'book_id', oi.book_id,
              'title', b.title,
              'author', b.author,
              'cover_url', b.cover_url,
              'cover_color', b.cover_color,
              'emoji', b.emoji,
              'quantity', oi.quantity,
              'unit_price', oi.unit_price
            )
            ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN books b ON b.id = oi.book_id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    res.json({ orders: rows.map(serializeOrder) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const order = await fetchOrderById(req.user.id, req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    res.json({ order });
  } catch (error) {
    next(error);
  }
});

module.exports = router;