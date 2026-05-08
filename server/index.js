const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const authRoutes = require('./routes/auth');
const booksRoutes = require('./routes/books');
const cartRoutes = require('./routes/cart');
const ordersRoutes = require('./routes/orders');
const wishlistRoutes = require('./routes/wishlist');
const reviewsRoutes = require('./routes/reviews');
const promotionsRoutes = require('./routes/promotions');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');

const app = express();
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
app.use(cors({ origin: clientUrl || true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Serve static client files early to avoid them being rate-limited
app.use(express.static(clientDir));

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

if (require.main === module) {
  app.listen(port, () => {
    console.log(`booksta server listening on port ${port}`);
  });
}

module.exports = app;