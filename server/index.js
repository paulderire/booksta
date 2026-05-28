const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const isProduction = process.env.NODE_ENV === 'production';

const authRoutes = require('./routes/auth');
const booksRoutes = require('./routes/books');
const cartRoutes = require('./routes/cart');
const ordersRoutes = require('./routes/orders');
const wishlistRoutes = require('./routes/wishlist');
const reviewsRoutes = require('./routes/reviews');
const promotionsRoutes = require('./routes/promotions');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');
const personalizationRoutes = require('./routes/personalization');
const { pool, query } = require('./db');
const { ensureSchema, seed } = require('./seed');

// Improve diagnostics: handle pool errors and log resource usage periodically
if (pool && typeof pool.on === 'function') {
  pool.on('error', (err) => {
    console.error('Postgres pool error event:', err && err.stack ? err.stack : err);
  });
}

// Process-level error handlers to avoid silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
  // In production you might want to exit and let a process manager restart the app
});

function logResourceUsage() {
  try {
    const mem = process.memoryUsage();
    const usage = {
      rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
      external: Math.round(mem.external / 1024 / 1024) + 'MB'
    };
    const poolStats = pool ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } : {};
    console.log('resource-usage', { usage, pool: poolStats });
  } catch (e) {
    console.warn('resource logging failed', e);
  }
}
setInterval(logResourceUsage, 60 * 1000); // log every minute

const app = express();
// Scope proxy trust via env var. Defaults to 'loopback' (safer than true).
const trustProxy = process.env.TRUST_PROXY || 'loopback';
app.set('trust proxy', trustProxy);
const clientDir = path.resolve(process.cwd(), 'client');
const clientUrl = process.env.CLIENT_URL;

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", clientUrl].filter(Boolean)
    }
  }
}));
app.use(cors({ origin: clientUrl || true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(compression()); // Enable gzip compression

// Logging: use 'combined' in production, 'dev' in development
app.use(morgan(isProduction ? 'combined' : 'dev'));

// Serve static client files with aggressive caching
// Dynamic sitemap endpoint: builds sitemap from DB (books) and key pages.
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    // Build absolute base URL
    const base = process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`;

    // Fetch recent books to include in sitemap (limit to 50000)
    // Some deployments may not have an `updated_at` column; use COALESCE to fall back to `created_at` when available.
    const { rows } = await query(
      `SELECT id, created_at, COALESCE(updated_at, created_at) AS lastmod FROM books ORDER BY created_at DESC LIMIT 50000`,
      []
    );

    // Fetch distinct genres and top authors to include category/author pages
    const genresRes = await query(
      `SELECT genre, COUNT(*)::int AS book_count
       FROM (
         SELECT unnest(CASE WHEN genres IS NULL OR cardinality(genres) = 0 THEN ARRAY_REMOVE(ARRAY[genre], NULL) ELSE genres END) AS genre
         FROM books
       ) gv
       WHERE genre IS NOT NULL AND genre <> ''
       GROUP BY genre
       ORDER BY book_count DESC
       LIMIT 500`,
      []
    );

    const authorsRes = await query(
      `SELECT author, COUNT(*)::int AS book_count
       FROM books
       WHERE author IS NOT NULL AND author <> ''
       GROUP BY author
       ORDER BY book_count DESC
       LIMIT 500`,
      []
    );

    // Active promotions overview (we'll include the promotions landing page)
    const promosRes = await query(`SELECT id, code FROM promotions WHERE is_active = TRUE AND expires_at >= CURRENT_DATE LIMIT 200`, []);

    const urls = [];
    // Add core pages
    urls.push({ loc: base + '/', priority: 1.0, changefreq: 'daily' });
    urls.push({ loc: base + '/books', priority: 0.8, changefreq: 'daily' });
    urls.push({ loc: base + '/wishlist', priority: 0.4, changefreq: 'weekly' });
    urls.push({ loc: base + '/orders', priority: 0.4, changefreq: 'weekly' });

    rows.forEach((row) => {
      const loc = `${base}/book/${encodeURIComponent(row.id)}`;
      const lastmod = row.lastmod ? new Date(row.lastmod).toISOString() : null;
      urls.push({ loc, lastmod, priority: 0.7, changefreq: 'monthly' });
    });

    // Add genre pages
    (genresRes.rows || []).forEach((g) => {
      const loc = `${base}/books?genre=${encodeURIComponent(g.genre)}`;
      urls.push({ loc, priority: 0.6, changefreq: 'weekly' });
    });

    // Add author search pages
    (authorsRes.rows || []).forEach((a) => {
      const loc = `${base}/search?author=${encodeURIComponent(a.author)}`;
      urls.push({ loc, priority: 0.5, changefreq: 'weekly' });
    });

    // Add promotions landing page and per-promo pages
    if ((promosRes.rows || []).length) {
      urls.push({ loc: base + '/promotions', priority: 0.6, changefreq: 'weekly' });
      (promosRes.rows || []).forEach((p) => {
        const loc = `${base}/promotions?code=${encodeURIComponent(p.code)}`;
        urls.push({ loc, priority: 0.4, changefreq: 'monthly' });
      });
    }

    res.header('Content-Type', 'application/xml');
    const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
    urls.forEach((u) => {
      xml.push('  <url>');
      xml.push(`    <loc>${escapeXml(u.loc)}</loc>`);
      if (u.lastmod) xml.push(`    <lastmod>${u.lastmod}</lastmod>`);
      if (u.changefreq) xml.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (u.priority !== undefined) xml.push(`    <priority>${u.priority}</priority>`);
      xml.push('  </url>');
    });
    xml.push('</urlset>');
    res.send(xml.join('\n'));
  } catch (err) {
    next(err);
  }
});

app.use(express.static(clientDir, {
  maxAge: isProduction ? '1y' : 0,
  etag: false,
  lastModified: false
}));

// Helper to escape XML special chars
function escapeXml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Set cache headers for specific file types
app.get('/api/*', (_req, res, next) => {
  res.set('Cache-Control', 'private, max-age=0, must-revalidate');
  next();
});

// Apply rate limiting only to API endpoints (avoid throttling static assets)
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 200, // allow more requests across the API
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.connection.remoteAddress
}));

// Tighter limit for authentication endpoints to slow brute-force
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false
}));

app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/promotions', promotionsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', personalizationRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.get(/^\/(?!api).*/, (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  const message = error.message || 'Internal Server Error';
  res.status(status).json({ error: message });
});

const port = process.env.PORT || 5000;

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    const { rows } = await client.query('SELECT COUNT(*)::int AS total FROM books');
    const bookCount = Number(rows[0]?.total || 0);
    if (bookCount === 0) {
      console.log('booksta: empty database detected, seeding sample data');
      await seed({ closePool: false });
    }
  } finally {
    client.release();
  }
}

if (require.main === module) {
  initializeDatabase()
    .then(() => {
      // Start server and keep reference for graceful shutdown
      const server = app.listen(port, () => {
        console.log(`booksta server listening on port ${port}`);
      });

      // Graceful shutdown helper
      const shutdown = (signal) => {
        console.log(`Received ${signal} - closing server and database pool...`);
        // stop accepting new connections
        try {
          server.close(async () => {
            try {
              if (pool && typeof pool.end === 'function') {
                await pool.end();
                console.log('Postgres pool closed');
              }
            } catch (err) {
              console.error('Error closing pool during shutdown', err);
            }
            console.log('Shutdown complete, exiting.');
            process.exit(0);
          });
        } catch (err) {
          console.error('Error during server close', err);
          process.exit(1);
        }

        // Force exit if shutdown hangs
        setTimeout(() => {
          console.error('Forcing shutdown after timeout');
          process.exit(1);
        }, 30 * 1000).unref();
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((error) => {
      console.error('booksta database initialization failed', error);
      process.exit(1);
    });
}

module.exports = app;