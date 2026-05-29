const express = require('express');
const { auth, requireAdmin } = require('../middleware/auth');
const { query } = require('../db');
const { serializeBook, serializeOrder } = require('../utils');
const { createBackInStockNotifications, createUserNotification } = require('../personalization');

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
    const [{ rows: urows }, { rows: orows }, { rows: brows }, { rows: totalBooksRows }, { rows: uniqueAuthorsRows }] = await Promise.all([
      query('SELECT COUNT(*)::int AS total_users FROM users', []),
      query(`
        SELECT
          COUNT(*)::int AS total_orders,
          COALESCE(SUM(total) FILTER (WHERE status = 'completed'), 0)::numeric AS completed_revenue,
          COALESCE(SUM(total) FILTER (WHERE status = 'pending'), 0)::numeric AS pending_revenue
        FROM orders
      `, []),
      query(`SELECT b.id, b.title, COALESCE(SUM(oi.quantity),0)::int AS qty_sold
             FROM books b
             LEFT JOIN order_items oi ON oi.book_id = b.id
             GROUP BY b.id, b.title
             ORDER BY qty_sold DESC
             LIMIT 5`, []),
      query('SELECT COUNT(*)::int AS total_books FROM books', []),
      query('SELECT COUNT(DISTINCT LOWER(TRIM(author)))::int AS unique_authors FROM books WHERE author IS NOT NULL AND author != \'\'', [])
    ]);

    res.json({
      totalUsers: urows[0].total_users,
      totalOrders: orows[0].total_orders,
      totalRevenue: parseFloat(orows[0].completed_revenue),
      pendingRevenue: parseFloat(orows[0].pending_revenue),
      totalBooks: totalBooksRows[0].total_books,
      uniqueAuthors: uniqueAuthorsRows[0].unique_authors,
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
        tiktokUrl: map.tiktokUrl || '#/social/tiktok',
        smtpHost: map.smtpHost || '',
        smtpPort: map.smtpPort || '587',
        smtpSecure: map.smtpSecure || 'false',
        smtpUser: map.smtpUser || '',
        smtpFrom: map.smtpFrom || '',
        clientUrl: map.clientUrl || '',
        smtpPassConfigured: Boolean(map.smtpPass)
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
      tiktokUrl: String(req.body?.tiktokUrl || '').trim(),
      smtpHost: String(req.body?.smtpHost || '').trim(),
      smtpPort: String(req.body?.smtpPort || '').trim(),
      smtpSecure: String(req.body?.smtpSecure || '').trim(),
      smtpUser: String(req.body?.smtpUser || '').trim(),
      smtpFrom: String(req.body?.smtpFrom || '').trim(),
      clientUrl: String(req.body?.clientUrl || '').trim()
    };

    const smtpPass = String(req.body?.smtpPass || '');
    if (smtpPass.trim()) {
      incoming.smtpPass = smtpPass;
    }

    const entries = Object.entries(incoming).filter(([, value]) => value);
    for (const [key, value] of entries) {
      await query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
      );
    }

    const { rows: passRows } = await query('SELECT value FROM app_settings WHERE key = $1 LIMIT 1', ['smtpPass']);
    res.json({ settings: { ...incoming, smtpPassConfigured: Boolean(passRows[0]?.value) } });
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
    const { rows } = await query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.created_at,
        COALESCE(COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'completed'), 0)::int AS completed_orders,
        COALESCE(COUNT(DISTINCT o.id), 0)::int AS total_orders,
        COALESCE(SUM(o.total) FILTER (WHERE o.status = 'completed'), 0)::numeric AS total_spent,
        COALESCE(AVG(o.total) FILTER (WHERE o.status = 'completed'), 0)::numeric AS avg_order_value,
        MAX(o.created_at) AS last_purchase_at
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      GROUP BY u.id
      ORDER BY total_spent DESC, completed_orders DESC, u.created_at DESC
    `, []);

    const ranked = rows.map((row, index) => ({
      ...row,
      completed_orders: Number(row.completed_orders || 0),
      total_orders: Number(row.total_orders || 0),
      total_spent: Number(row.total_spent || 0),
      avg_order_value: Number(row.avg_order_value || 0),
      buyer_rank: index + 1,
      buyer_score: Math.min(100, Math.round((Number(row.total_spent || 0) / 1000) + (Number(row.completed_orders || 0) * 8))),
      customer_tier: Number(row.total_spent || 0) >= 100000 ? 'vip' : Number(row.total_spent || 0) >= 50000 ? 'gold' : Number(row.total_spent || 0) >= 20000 ? 'silver' : 'standard'
    }));

    res.json({ users: ranked });
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
      SELECT id, title, author, stock, genre, genres, cover_url
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
    const previous = await query('SELECT id, title, author, genre, genres, stock, cover_url, cover_color, emoji FROM books WHERE id = $1', [req.params.id]);
    const { rows } = await query('UPDATE books SET stock = $1 WHERE id = $2 RETURNING id, title, stock', [stock, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Book not found.' });
    if (previous.rows[0]) {
      await createBackInStockNotifications(previous.rows[0], Number(previous.rows[0].stock || 0), Number(stock || 0));
    }
    res.json({ book: rows[0] });
  } catch (error) {
    next(error);
  }
});

// Revenue analytics
router.get('/analytics/revenue', async (req, res, next) => {
  try {
    const range = String(req.query.range || '30d').toLowerCase();
    const rangeDays = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '365d': 365,
      all: null
    }[range] ?? 30;

    const rangeClause = rangeDays
      ? `WHERE created_at >= NOW() - INTERVAL '${rangeDays} days' AND status = 'completed'`
      : `WHERE status = 'completed'`;

    const { rows } = await query(`
      SELECT DATE(created_at) as date, COALESCE(SUM(total), 0)::numeric as revenue, COUNT(*)::int as orders
      FROM orders
      ${rangeClause}
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
      SELECT g.genre, COUNT(oi.id)::int as totalSales, COALESCE(SUM(o.total), 0)::numeric as revenue
      FROM books b
      JOIN LATERAL unnest(CASE WHEN b.genres IS NULL OR cardinality(b.genres) = 0 THEN ARRAY_REMOVE(ARRAY[b.genre], NULL) ELSE b.genres END) AS g(genre) ON true
      LEFT JOIN order_items oi ON oi.book_id = b.id
      LEFT JOIN orders o ON o.id = oi.order_id AND o.status = 'completed'
      GROUP BY g.genre
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
    const { rows } = await query(`
      SELECT p.*, u.name AS target_user_name, u.email AS target_user_email
      FROM promotions p
      LEFT JOIN users u ON u.id = p.target_user_id
      ORDER BY p.created_at DESC
    `);
    res.json({ promotions: rows });
  } catch (error) {
    next(error);
  }
});

router.get('/promotions/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT p.*, u.name AS target_user_name, u.email AS target_user_email
      FROM promotions p
      LEFT JOIN users u ON u.id = p.target_user_id
      WHERE p.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Promotion not found' });
    res.json({ promotion: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/promotions', async (req, res, next) => {
  try {
    const { code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active, target_user_id } = req.body;
    const { rows } = await query(
      `INSERT INTO promotions (code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active, target_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active, target_user_id || null]
    );

    if (rows[0] && rows[0].target_user_id && rows[0].is_active) {
      const { rows: targetRows } = await query('SELECT id, name, email FROM users WHERE id = $1 AND role = $2', [rows[0].target_user_id, 'customer']);
      const targetUser = targetRows[0];
      if (targetUser) {
        await createUserNotification({
          userId: targetUser.id,
          type: 'promotion_targeted',
          title: `A special discount is waiting for you: ${rows[0].code}`,
          body: `You were selected for the ${rows[0].code} promotion. Check the admin offer details for your discount.`,
          data: {
            promotionId: rows[0].id,
            promotionCode: rows[0].code,
            discountType: rows[0].discount_type,
            discountValue: rows[0].discount_value
          },
          dedupeKey: `promotion-target:${rows[0].id}:${targetUser.id}`
        });
      }
    }

    res.status(201).json({ promotion: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch('/promotions/:id', async (req, res, next) => {
  try {
    const { code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active, target_user_id } = req.body;
    
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
    if (target_user_id !== undefined) { updates.push(`target_user_id=$${paramIndex++}`); values.push(target_user_id || null); }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE promotions SET ${updates.join(', ')} WHERE id=$${paramIndex} RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Promotion not found' });

    if (rows[0].target_user_id && rows[0].is_active) {
      const { rows: targetRows } = await query('SELECT id, name, email FROM users WHERE id = $1 AND role = $2', [rows[0].target_user_id, 'customer']);
      const targetUser = targetRows[0];
      if (targetUser) {
        await createUserNotification({
          userId: targetUser.id,
          type: 'promotion_targeted',
          title: `A special discount is waiting for you: ${rows[0].code}`,
          body: `You were selected for the ${rows[0].code} promotion. Check the admin offer details for your discount.`,
          data: {
            promotionId: rows[0].id,
            promotionCode: rows[0].code,
            discountType: rows[0].discount_type,
            discountValue: rows[0].discount_value
          },
          dedupeKey: `promotion-target:${rows[0].id}:${targetUser.id}`
        });
      }
    }

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

// Ping search engines to notify sitemap update (admin-only)
router.post('/sitemap/ping', async (req, res, next) => {
  try {
    const sitemapUrl = (req.body && req.body.sitemap) || process.env.CLIENT_URL ? `${process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`}/sitemap.xml` : `${req.protocol}://${req.get('host')}/sitemap.xml`;

    // Build ping endpoints
    const endpoints = [
      `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
      `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
    ];

    const https = require('https');

    const ping = (url) => new Promise((resolve) => {
      try {
        const req = https.get(url, (r) => {
          const ok = r.statusCode >= 200 && r.statusCode < 400;
          resolve({ url, status: r.statusCode, ok });
        });
        req.on('error', (err) => resolve({ url, error: err.message }));
        req.setTimeout(5000, () => { req.abort(); resolve({ url, error: 'timeout' }); });
      } catch (err) {
        resolve({ url, error: String(err && err.message ? err.message : err) });
      }
    });

    const results = await Promise.all(endpoints.map(ping));
    res.json({ sitemap: sitemapUrl, results });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
