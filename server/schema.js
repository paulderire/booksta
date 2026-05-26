const schemaStatements = [
  "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'customer',
    password_reset_token_hash TEXT,
    password_reset_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    description TEXT,
    cover_url TEXT,
    cover_color VARCHAR(20),
    emoji VARCHAR(10),
    genre VARCHAR(50),
    price NUMERIC(10,2) NOT NULL,
    original_price NUMERIC(10,2),
    stock INTEGER DEFAULT 0,
    pages INTEGER,
    year INTEGER,
    isbn VARCHAR(30) UNIQUE,
    featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID REFERENCES books(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    body TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(book_id, user_id)
  );`,
  `CREATE TABLE IF NOT EXISTS cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    book_id UUID REFERENCES books(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, book_id)
  );`,
  `CREATE TABLE IF NOT EXISTS wishlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    book_id UUID REFERENCES books(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, book_id)
  );`,
  `CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    total NUMERIC(10,2) NOT NULL,
    status VARCHAR(30) DEFAULT 'pending',
    shipping_address JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS reading_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    book_id UUID REFERENCES books(id) ON DELETE CASCADE,
    event_type VARCHAR(40) NOT NULL DEFAULT 'view',
    source VARCHAR(40),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    book_id UUID REFERENCES books(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(60) NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    book_id UUID REFERENCES books(id) ON DELETE SET NULL,
    data JSONB DEFAULT '{}'::jsonb,
    dedupe_key TEXT UNIQUE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL,
    discount_value NUMERIC(10,2) NOT NULL,
    min_order_amount NUMERIC(10,2) DEFAULT 0,
    times_used INTEGER DEFAULT 0,
    max_uses INTEGER,
    expires_at DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );`,
  // Indexes for faster queries
  "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);",
  "CREATE INDEX IF NOT EXISTS idx_books_genre ON books(genre);",
  "CREATE INDEX IF NOT EXISTS idx_books_featured ON books(featured) WHERE featured = TRUE;",
  "CREATE INDEX IF NOT EXISTS idx_reviews_book_id ON reviews(book_id);",
  "CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);",
  "CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);",
  "CREATE INDEX IF NOT EXISTS idx_wishlist_items_user_id ON wishlist_items(user_id);",
  "CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);",
  "CREATE INDEX IF NOT EXISTS idx_reading_events_user_id ON reading_events(user_id);",
  "CREATE INDEX IF NOT EXISTS idx_reading_events_book_id ON reading_events(book_id);",
  "CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);",
  "CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;",
  "CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);",
  "CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(code);",
  "CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active) WHERE is_active = TRUE;"
];

module.exports = {
  schemaStatements
};