function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeGenres(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((genre) => String(genre || '').trim()).filter(Boolean))];
  }

  if (typeof value === 'string') {
    return [...new Set(value.split(',').map((genre) => genre.trim()).filter(Boolean))];
  }

  return [];
}

function serializeUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar_url: user.avatar_url || null,
    role: user.role,
    created_at: user.created_at
  };
}

function serializeBook(book) {
  const genres = normalizeGenres(book.genres);
  const primaryGenre = book.genre || genres[0] || null;
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    description: book.description,
    cover_url: book.cover_url,
    cover_color: book.cover_color,
    emoji: book.emoji,
    genre: primaryGenre,
    genres: genres.length ? genres : (primaryGenre ? [primaryGenre] : []),
    price: toNumber(book.price, 0),
    original_price: toNumber(book.original_price, null),
    stock: toNumber(book.stock, 0),
    pages: toNumber(book.pages, null),
    year: toNumber(book.year, null),
    isbn: book.isbn,
    featured: Boolean(book.featured),
    avg_rating: toNumber(book.avg_rating, 0),
    review_count: toNumber(book.review_count, 0),
    created_at: book.created_at
  };
}

function serializeOrder(order) {
  return {
    id: order.id,
    user_id: order.user_id,
    total: toNumber(order.total, 0),
    status: order.status,
    shipping_address: order.shipping_address,
    created_at: order.created_at,
    items: Array.isArray(order.items)
      ? order.items.map((item) => ({
          id: item.id,
          book_id: item.book_id,
          title: item.title,
          author: item.author,
          cover_url: item.cover_url,
          cover_color: item.cover_color,
          emoji: item.emoji,
          quantity: toNumber(item.quantity, 0),
          unit_price: toNumber(item.unit_price, 0)
        }))
      : []
  };
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'RWF',
    currencyDisplay: 'code',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
}

module.exports = {
  serializeBook,
  serializeOrder,
  serializeUser,
  normalizeGenres,
  toNumber,
  formatCurrency
};