const express = require('express');
const { auth, requireAdmin } = require('../middleware/auth');
const { query } = require('../db');
const { serializeBook, serializeOrder } = require('../utils');

const router = express.Router();

router.use(auth);
router.use(requireAdmin);

async function ensureSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// List all orders (admin)
router.get('/orders', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        o.id,
        o.user_id,
        u.name as user_name,
        u.email as user_email,
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
              'quantity', oi.quantity,
              'unit_price', oi.unit_price
            ) ORDER BY oi.id
          ) FILTER (WHERE oi.id IS NOT NULL), '[]'::json
        ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN books b ON b.id = oi.book_id
       LEFT JOIN users u ON u.id = o.user_id
       GROUP BY o.id, u.name, u.email
       ORDER BY o.created_at DESC`
    );

    // include user name/email from the query results so the admin UI can display customer info
    res.json({ orders: rows.map(r => ({ ...serializeOrder(r), user_name: r.user_name, user_email: r.user_email })) });
  } catch (error) {
    next(error);
  }
});

// CSV export of orders
router.get('/orders.csv', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.id, u.email AS user_email, o.total, o.status, o.created_at,
        json_agg(json_build_object('title', b.title, 'qty', oi.quantity)) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN books b ON b.id = oi.book_id
       LEFT JOIN users u ON u.id = o.user_id
       GROUP BY o.id, u.email
       ORDER BY o.created_at DESC`
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="booksta_orders.csv"');
    const header = 'order_id,user_email,total,status,created_at,items\n';
    const lines = rows.map(r => {
      const items = (r.items || []).map(i => `${i.title} x${i.qty || ''}`).join('; ');
      return `${r.id},"${r.user_email || ''}",${r.total},${r.status},${r.created_at.toISOString()},"${items.replace(/"/g, '""') }"`;
    });
    res.send(header + lines.join('\n'));
  } catch (error) {
    next(error);
  }
});

// Admin stats
router.get('/stats', async (_req, res, next) => {
  try {
    const [{ rows: urows }, { rows: orows }, { rows: brows }] = await Promise.all([
      query('SELECT COUNT(*)::int AS total_users FROM users', []),
      query('SELECT COUNT(*)::int AS total_orders, COALESCE(SUM(total),0)::numeric AS total_revenue FROM orders', []),
      query(`SELECT b.id, b.title, COALESCE(SUM(oi.quantity),0)::int AS qty_sold
             FROM books b
             LEFT JOIN order_items oi ON oi.book_id = b.id
             GROUP BY b.id, b.title
             ORDER BY qty_sold DESC
             LIMIT 5`, [])
    ]);

    res.json({
      totalUsers: urows[0].total_users,
      totalOrders: orows[0].total_orders,
      totalRevenue: parseFloat(orows[0].total_revenue),
      topBooks: brows.map(r => ({ id: r.id, title: r.title, qtySold: r.qty_sold }))
    });
  } catch (error) {
    next(error);
  }
});

// Update user role
router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'Role is required.' });
    const { rows } = await query('UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role', [role, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: rows[0] });
  } catch (error) {
    next(error);
  }
});

// Delete user (admin)
router.delete('/users/:id', async (req, res, next) => {
  try {
    const userId = req.params.id;
    const actorId = req.user?.id;
    if (actorId && actorId === userId) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }

    const { rows } = await query('DELETE FROM users WHERE id = $1 RETURNING id, email', [userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found.' });
    res.json({ deleted: rows[0] });
  } catch (error) {
    next(error);
  }
});

// Settings management (admin)
router.get('/settings', async (_req, res, next) => {
  try {
    await ensureSettingsTable();
    const { rows } = await query('SELECT key, value FROM app_settings');
    const map = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    res.json({
      settings: {
        whatsappNumber: map.whatsappNumber || '250782781575',
        instagramUrl: map.instagramUrl || '#/social/instagram',
        facebookUrl: map.facebookUrl || '#/social/facebook',
        xUrl: map.xUrl || '#/social/x',
        tiktokUrl: map.tiktokUrl || '#/social/tiktok'
      }
    });
  } catch (error) {
    next(error);
  }
});

router.put('/settings', async (req, res, next) => {
  try {
    await ensureSettingsTable();
    const incoming = {
      whatsappNumber: String(req.body?.whatsappNumber || '').trim(),
      instagramUrl: String(req.body?.instagramUrl || '').trim(),
      facebookUrl: String(req.body?.facebookUrl || '').trim(),
      xUrl: String(req.body?.xUrl || '').trim(),
      tiktokUrl: String(req.body?.tiktokUrl || '').trim()
    };

    const entries = Object.entries(incoming).filter(([, value]) => value);
    for (const [key, value] of entries) {
      await query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
      );
    }

    res.json({ settings: incoming });
  } catch (error) {
    next(error);
  }
});

// Update order status (admin)
router.patch('/orders/:id', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required.' });
    const { rows } = await query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Order not found.' });
    res.json({ order: serializeOrder(rows[0]) });
  } catch (error) {
    next(error);
  }
});

// List users (admin)
router.get('/users', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC', []);
    res.json({ users: rows });
  } catch (error) {
    next(error);
  }
});

// List all reviews (admin)
router.get('/reviews', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT r.id, r.book_id, r.user_id, r.rating, r.body, r.created_at,
             b.title, b.cover_url, u.name, u.email
      FROM reviews r
      LEFT JOIN books b ON b.id = r.book_id
      LEFT JOIN users u ON u.id = r.user_id
      ORDER BY r.created_at DESC
    `);
    res.json({ reviews: rows });
  } catch (error) {
    next(error);
  }
});

// Delete review (admin)
router.delete('/reviews/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM reviews WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Review not found.' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Low stock alerts
router.get('/inventory-alerts', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT id, title, author, stock, genre, cover_url
      FROM books
      WHERE stock < 5
      ORDER BY stock ASC
    `);
    res.json({ lowStockBooks: rows });
  } catch (error) {
    next(error);
  }
});

// Books inventory summary for the admin books tab
router.get('/books-summary', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        b.*,
        COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'completed'), 0)::int AS sold_count,
        COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'pending'), 0)::int AS pending_count,
        COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'cancelled'), 0)::int AS cancelled_count,
        COALESCE(COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'completed'), 0)::int AS completed_orders,
        COALESCE(SUM(oi.quantity * oi.unit_price) FILTER (WHERE o.status = 'completed'), 0)::numeric AS completed_revenue
      FROM books b
      LEFT JOIN order_items oi ON oi.book_id = b.id
      LEFT JOIN orders o ON o.id = oi.order_id
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `);

    res.json({
      books: rows.map((row) => ({
        ...serializeBook(row),
        sold_count: Number(row.sold_count || 0),
        pending_count: Number(row.pending_count || 0),
        cancelled_count: Number(row.cancelled_count || 0),
        completed_orders: Number(row.completed_orders || 0),
        completed_revenue: Number(row.completed_revenue || 0),
        inventory_value: Number(row.stock || 0) * Number(row.price || 0),
        stock_status: Number(row.stock || 0) <= 5 ? 'low' : Number(row.stock || 0) <= 15 ? 'watch' : 'healthy'
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Update book featured status
router.patch('/books/:id/featured', async (req, res, next) => {
  try {
    const { featured } = req.body;
    const { rows } = await query('UPDATE books SET featured = $1 WHERE id = $2 RETURNING id, title, featured', [featured, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Book not found.' });
    res.json({ book: rows[0] });
  } catch (error) {
    next(error);
  }
});

// Update book stock
router.patch('/books/:id/stock', async (req, res, next) => {
  try {
    const { stock } = req.body;
    if (stock === undefined) return res.status(400).json({ error: 'Stock is required.' });
    const { rows } = await query('UPDATE books SET stock = $1 WHERE id = $2 RETURNING id, title, stock', [stock, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Book not found.' });
    res.json({ book: rows[0] });
  } catch (error) {
    next(error);
  }
});

// Revenue analytics
router.get('/analytics/revenue', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT DATE(created_at) as date, COALESCE(SUM(total), 0)::numeric as revenue, COUNT(*)::int as orders
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    res.json({ dailyRevenue: rows });
  } catch (error) {
    next(error);
  }
});

// Genre sales analytics
router.get('/analytics/genres', async (_req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT b.genre, COUNT(oi.id)::int as totalSales, COALESCE(SUM(o.total), 0)::numeric as revenue
      FROM books b
      LEFT JOIN order_items oi ON oi.book_id = b.id
      LEFT JOIN orders o ON o.id = oi.order_id
      GROUP BY b.genre
      ORDER BY totalSales DESC
    `);
    res.json({ genreSales: rows });
  } catch (error) {
    next(error);
  }
});

// Promotions Management
router.get('/promotions', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM promotions ORDER BY created_at DESC');
    res.json({ promotions: rows });
  } catch (error) {
    next(error);
  }
});

router.get('/promotions/:id', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM promotions WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Promotion not found' });
    res.json({ promotion: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/promotions', async (req, res, next) => {
  try {
    const { code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active } = req.body;
    const { rows } = await query(
      `INSERT INTO promotions (code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active]
    );
    res.status(201).json({ promotion: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch('/promotions/:id', async (req, res, next) => {
  try {
    const { code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active } = req.body;
    
    // Only update fields that are provided
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (code !== undefined) { updates.push(`code=$${paramIndex++}`); values.push(code); }
    if (description !== undefined) { updates.push(`description=$${paramIndex++}`); values.push(description); }
    if (discount_type !== undefined) { updates.push(`discount_type=$${paramIndex++}`); values.push(discount_type); }
    if (discount_value !== undefined) { updates.push(`discount_value=$${paramIndex++}`); values.push(discount_value); }
    if (min_order_amount !== undefined) { updates.push(`min_order_amount=$${paramIndex++}`); values.push(min_order_amount); }
    if (max_uses !== undefined) { updates.push(`max_uses=$${paramIndex++}`); values.push(max_uses); }
    if (expires_at !== undefined) { updates.push(`expires_at=$${paramIndex++}`); values.push(expires_at); }
    if (is_active !== undefined) { updates.push(`is_active=$${paramIndex++}`); values.push(is_active); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE promotions SET ${updates.join(', ')} WHERE id=$${paramIndex} RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Promotion not found' });
    res.json({ promotion: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/promotions/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM promotions WHERE id = $1 RETURNING *', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Promotion not found' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
