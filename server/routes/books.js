const express = require('express');
const { query } = require('../db');
const { auth, requireAdmin } = require('../middleware/auth');
const { serializeBook } = require('../utils');

const router = express.Router();

function getSortClause(sort) {
  switch (sort) {
    case 'price_asc':
      return 'ORDER BY b.price ASC, b.created_at DESC';
    case 'price_desc':
      return 'ORDER BY b.price DESC, b.created_at DESC';
    case 'rating':
      return 'ORDER BY COALESCE(AVG(r.rating), 0) DESC, b.created_at DESC';
    case 'newest':
      return 'ORDER BY b.created_at DESC';
    case 'title_asc':
      return 'ORDER BY b.title ASC';
    case 'featured':
    default:
      return 'ORDER BY b.featured DESC, COALESCE(AVG(r.rating), 0) DESC, b.created_at DESC';
  }
}

function buildFilters({ genre, search }) {
  const clauses = [];
  const values = [];
  const normalizedSearch = typeof search === 'string' ? search.trim() : '';

  if (genre) {
    values.push(genre);
    clauses.push(`b.genre = $${values.length}`);
  }

  if (normalizedSearch) {
    values.push(`%${normalizedSearch}%`);
    clauses.push(`(
      b.title ILIKE $${values.length}
      OR b.author ILIKE $${values.length}
      OR b.description ILIKE $${values.length}
      OR b.genre ILIKE $${values.length}
      OR COALESCE(b.isbn, '') ILIKE $${values.length}
    )`);
  }

  return { clauses, values };
}

async function getBooks(req, res, extraWhere = [], extraValues = [], extraOrder = null, limitOverride = null) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.max(Number(limitOverride || req.query.limit || 12), 1);
  const offset = (page - 1) * limit;
  const { clauses, values } = buildFilters(req.query);
  const whereClauses = [...clauses, ...extraWhere];
  const params = [...values, ...extraValues];
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const sortClause = extraOrder || getSortClause(req.query.sort || 'featured');

  const booksQuery = `
    SELECT
      b.*,
      COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS avg_rating,
      COUNT(r.id)::int AS review_count
    FROM books b
    LEFT JOIN reviews r ON r.book_id = b.id
    ${whereSql}
    GROUP BY b.id
    ${sortClause}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const countQuery = `SELECT COUNT(*)::int AS total FROM books b ${whereSql}`;

  const [booksResult, countResult] = await Promise.all([
    query(booksQuery, [...params, limit, offset]),
    query(countQuery, params)
  ]);

  const books = booksResult.rows.map(serializeBook);
  const total = countResult.rows[0]?.total || 0;

  return res.json({
    books,
    total,
    page,
    totalPages: Math.max(Math.ceil(total / limit), 1)
  });
}

router.get('/', async (req, res, next) => {
  try {
    await getBooks(req, res);
  } catch (error) {
    next(error);
  }
});

router.get('/featured', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*, COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS avg_rating, COUNT(r.id)::int AS review_count
       FROM books b
       LEFT JOIN reviews r ON r.book_id = b.id
       WHERE b.featured = TRUE
       GROUP BY b.id
       ORDER BY b.created_at DESC
       LIMIT 8`,
      []
    );
    res.json({ books: rows.map(serializeBook) });
  } catch (error) {
    next(error);
  }
});

router.get('/genres', async (_req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT DISTINCT genre FROM books WHERE genre IS NOT NULL ORDER BY genre ASC',
      []
    );
    res.json({ genres: rows.map((row) => row.genre) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT b.*, COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS avg_rating, COUNT(r.id)::int AS review_count
       FROM books b
       LEFT JOIN reviews r ON r.book_id = b.id
       WHERE b.id = $1
       GROUP BY b.id`,
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    res.json({ book: serializeBook(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.post('/', auth, requireAdmin, async (req, res, next) => {
  try {
    const fields = ['title', 'author', 'description', 'cover_url', 'cover_color', 'emoji', 'genre', 'price', 'original_price', 'stock', 'pages', 'year', 'isbn', 'featured'];
    const values = fields.map((field) => req.body?.[field] ?? null);
    if (!values[0] || !values[1] || values[7] === null) {
      return res.status(400).json({ error: 'Title, author, and price are required.' });
    }

    const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
    const { rows } = await query(
      `INSERT INTO books (${fields.join(', ')})
       VALUES (${placeholders})
       RETURNING *`,
      values
    );

    res.status(201).json({ book: serializeBook(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', auth, requireAdmin, async (req, res, next) => {
  try {
    const allowed = ['title', 'author', 'description', 'cover_url', 'cover_color', 'emoji', 'genre', 'price', 'original_price', 'stock', 'pages', 'year', 'isbn', 'featured'];
    const updates = [];
    const values = [];

    allowed.forEach((field) => {
      if (req.body?.[field] !== undefined) {
        values.push(req.body[field]);
        updates.push(`${field} = $${values.length}`);
      }
    });

    if (!updates.length) {
      return res.status(400).json({ error: 'No book fields were provided.' });
    }

    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE books SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    res.json({ book: serializeBook(rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', auth, requireAdmin, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM books WHERE id = $1', [req.params.id]);
    if (!rowCount) {
      return res.status(404).json({ error: 'Book not found.' });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;