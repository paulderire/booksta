const { query } = require('./db');
const { serializeBook } = require('./utils');

function normalizeIdList(rows, key) {
  return rows.map((row) => String(row[key])).filter(Boolean);
}

async function getTasteProfile(userId) {
  const [genreRows, authorRows, seenRows] = await Promise.all([
    query(
      `WITH signals AS (
        SELECT b.genre, 4 AS weight
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN books b ON b.id = oi.book_id
        WHERE o.user_id = $1 AND o.status = 'completed'
        UNION ALL
        SELECT b.genre, 3 AS weight
        FROM wishlist_items w
        JOIN books b ON b.id = w.book_id
        WHERE w.user_id = $1
        UNION ALL
        SELECT b.genre, 2 AS weight
        FROM reviews r
        JOIN books b ON b.id = r.book_id
        WHERE r.user_id = $1
        UNION ALL
        SELECT b.genre, 1 AS weight
        FROM reading_events e
        JOIN books b ON b.id = e.book_id
        WHERE e.user_id = $1
      )
      SELECT genre, SUM(weight)::int AS score
      FROM signals
      WHERE genre IS NOT NULL AND genre <> ''
      GROUP BY genre
      ORDER BY score DESC, genre ASC
      LIMIT 6`,
      [userId]
    ),
    query(
      `WITH signals AS (
        SELECT b.author, 4 AS weight
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN books b ON b.id = oi.book_id
        WHERE o.user_id = $1 AND o.status = 'completed'
        UNION ALL
        SELECT b.author, 3 AS weight
        FROM wishlist_items w
        JOIN books b ON b.id = w.book_id
        WHERE w.user_id = $1
        UNION ALL
        SELECT b.author, 2 AS weight
        FROM reviews r
        JOIN books b ON b.id = r.book_id
        WHERE r.user_id = $1
        UNION ALL
        SELECT b.author, 1 AS weight
        FROM reading_events e
        JOIN books b ON b.id = e.book_id
        WHERE e.user_id = $1
      )
      SELECT author, SUM(weight)::int AS score
      FROM signals
      WHERE author IS NOT NULL AND author <> ''
      GROUP BY author
      ORDER BY score DESC, author ASC
      LIMIT 6`,
      [userId]
    ),
    query(
      `SELECT DISTINCT book_id
       FROM (
         SELECT oi.book_id
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.user_id = $1 AND o.status = 'completed'
         UNION ALL
         SELECT book_id FROM wishlist_items WHERE user_id = $1
         UNION ALL
         SELECT book_id FROM reviews WHERE user_id = $1
         UNION ALL
         SELECT book_id FROM reading_events WHERE user_id = $1
       ) seen`,
      [userId]
    )
  ]);

  const favoriteGenres = genreRows.rows.map((row) => ({ name: row.genre, score: Number(row.score || 0) }));
  const favoriteAuthors = authorRows.rows.map((row) => ({ name: row.author, score: Number(row.score || 0) }));
  const seenBookIds = normalizeIdList(seenRows.rows, 'book_id');

  return {
    favoriteGenres,
    favoriteAuthors,
    seenBookIds
  };
}

function scoreBookForProfile(book, profile) {
  let score = 0;
  const reasons = [];
  const bookGenres = Array.isArray(book.genres) && book.genres.length ? book.genres : [book.genre].filter(Boolean);

  profile.favoriteGenres.forEach((genre, index) => {
    if (bookGenres.some((entry) => String(entry).toLowerCase() === String(genre.name).toLowerCase())) {
      const weight = Math.max(8, 22 - (index * 3));
      score += weight;
      reasons.push(`matches your interest in ${genre.name}`);
    }
  });

  profile.favoriteAuthors.forEach((author, index) => {
    if (String(book.author || '').toLowerCase() === String(author.name).toLowerCase()) {
      const weight = Math.max(10, 24 - (index * 4));
      score += weight;
      reasons.push(`by ${author.name}`);
    }
  });

  if (book.featured) {
    score += 3;
  }

  score += Math.min(8, Number(book.avg_rating || 0) * 1.5);
  score += Math.min(6, Number(book.review_count || 0) * 0.35);
  score += Math.min(6, Number(book.sold_count || 0) * 0.05);

  if (Number(book.stock || 0) > 0) {
    score += 2;
  }

  if (!reasons.length) {
    reasons.push('popular with readers');
  }

  return { score, reasons };
}

async function getRecommendationsForUser(userId, limit = 8) {
  const profile = await getTasteProfile(userId);
  const { rows } = await query(
    `SELECT
      b.*,
      COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) AS avg_rating,
      COUNT(r.id)::int AS review_count,
      COALESCE(SUM(oi.quantity) FILTER (WHERE o.status = 'completed'), 0)::int AS sold_count
     FROM books b
     LEFT JOIN reviews r ON r.book_id = b.id
     LEFT JOIN order_items oi ON oi.book_id = b.id
     LEFT JOIN orders o ON o.id = oi.order_id
     GROUP BY b.id
     ORDER BY b.created_at DESC
     LIMIT 150`,
    []
  );

  const seenSet = new Set(profile.seenBookIds);
  let candidates = rows
    .filter((row) => !seenSet.has(String(row.id)))
    .map((row) => {
      const book = serializeBook(row);
      const scoring = scoreBookForProfile(book, profile);
      return {
        ...book,
        sold_count: Number(row.sold_count || 0),
        recommendation_score: Number(scoring.score.toFixed(2)),
        recommendation_reason: scoring.reasons.join(' · ')
      };
    })
    .sort((left, right) => right.recommendation_score - left.recommendation_score || right.review_count - left.review_count);

  if (candidates.length < 4) {
    const remainingCount = 4 - candidates.length;
    const seenCandidates = rows
      .filter((row) => seenSet.has(String(row.id)))
      .map((row) => {
        const book = serializeBook(row);
        const scoring = scoreBookForProfile(book, profile);
        return {
          ...book,
          sold_count: Number(row.sold_count || 0),
          recommendation_score: Number(scoring.score.toFixed(2)),
          recommendation_reason: scoring.reasons.join(' · ')
        };
      })
      .sort((left, right) => right.recommendation_score - left.recommendation_score || right.review_count - left.review_count);

    candidates = [...candidates, ...seenCandidates.slice(0, remainingCount)];
  }

  const finalRecommendations = candidates.slice(0, limit);

  return {
    profile,
    books: finalRecommendations
  };
}

async function trackReadingEvent(userId, bookId, eventType = 'view', source = 'book-detail', metadata = {}) {
  if (!userId || !bookId) {
    return null;
  }

  const { rows } = await query(
    `INSERT INTO reading_events (user_id, book_id, event_type, source, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [userId, bookId, eventType, source, metadata]
  );

  return rows[0] || null;
}

async function createBackInStockNotifications(book, previousStock, nextStock) {
  if (!book || !(Number(previousStock) <= 0 && Number(nextStock) > 0)) {
    return { created: 0 };
  }

  const { rows: matches } = await query(
    `WITH
     direct_interest AS (
       SELECT DISTINCT user_id, TRUE AS exact_interest
       FROM (
         SELECT user_id FROM wishlist_items WHERE book_id = $1
         UNION ALL
         SELECT user_id FROM reviews WHERE book_id = $1
         UNION ALL
         SELECT user_id FROM reading_events WHERE book_id = $1
         UNION ALL
         SELECT o.user_id FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE oi.book_id = $1 AND o.status = 'completed'
       ) x
     ),
     user_genre_scores AS (
       SELECT user_id, genre, SUM(weight) as score
       FROM (
         SELECT o.user_id, b.genre, 4 AS weight
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN books b ON b.id = oi.book_id
         WHERE o.status = 'completed'
         UNION ALL
         SELECT w.user_id, b.genre, 3 AS weight
         FROM wishlist_items w
         JOIN books b ON b.id = w.book_id
         UNION ALL
         SELECT r.user_id, b.genre, 2 AS weight
         FROM reviews r
         JOIN books b ON b.id = r.book_id
         UNION ALL
         SELECT e.user_id, b.genre, 1 AS weight
         FROM reading_events e
         JOIN books b ON b.id = e.book_id
       ) g
       WHERE genre IS NOT NULL AND genre <> ''
       GROUP BY user_id, genre
     ),
     user_genre_ranks AS (
       SELECT user_id, genre,
              ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score DESC, genre ASC) as rank
       FROM user_genre_scores
     ),
     genre_matches AS (
       SELECT user_id, TRUE AS genre_match
       FROM user_genre_ranks
       WHERE LOWER(genre) = LOWER($2) AND rank <= 6
     ),
     user_author_scores AS (
       SELECT user_id, author, SUM(weight) as score
       FROM (
         SELECT o.user_id, b.author, 4 AS weight
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN books b ON b.id = oi.book_id
         WHERE o.status = 'completed'
         UNION ALL
         SELECT w.user_id, b.author, 3 AS weight
         FROM wishlist_items w
         JOIN books b ON b.id = w.book_id
         UNION ALL
         SELECT r.user_id, b.author, 2 AS weight
         FROM reviews r
         JOIN books b ON b.id = r.book_id
         UNION ALL
         SELECT e.user_id, b.author, 1 AS weight
         FROM reading_events e
         JOIN books b ON b.id = e.book_id
       ) a
       WHERE author IS NOT NULL AND author <> ''
       GROUP BY user_id, author
     ),
     user_author_ranks AS (
       SELECT user_id, author,
              ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score DESC, author ASC) as rank
       FROM user_author_scores
     ),
     author_matches AS (
       SELECT user_id, TRUE AS author_match
       FROM user_author_ranks
       WHERE LOWER(author) = LOWER($3) AND rank <= 6
     ),
     matched_users AS (
       SELECT u.id AS user_id,
              COALESCE(di.exact_interest, FALSE) AS exact_interest,
              COALESCE(gm.genre_match, FALSE) AS genre_match,
              COALESCE(am.author_match, FALSE) AS author_match
       FROM users u
       LEFT JOIN direct_interest di ON di.user_id = u.id
       LEFT JOIN genre_matches gm ON gm.user_id = u.id
       LEFT JOIN author_matches am ON am.user_id = u.id
       WHERE u.role = 'customer' AND (di.exact_interest IS TRUE OR gm.genre_match IS TRUE OR am.author_match IS TRUE)
     )
     SELECT * FROM matched_users`,
    [book.id, book.genre || '', book.author || '']
  );

  const insertPromises = matches.map(async (match) => {
    const reason = match.exact_interest
      ? 'a book you saved is back'
      : match.genre_match
        ? `new stock arrived for ${book.genre || 'a genre you like'}`
        : `another title by ${book.author || 'an author you follow'} is available`;

    const dedupeKey = `restock:${book.id}:${match.user_id}`;
    const { rowCount } = await query(
      `INSERT INTO notifications (user_id, type, title, body, book_id, data, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        match.user_id,
        'back_in_stock',
        `${book.title} is back in stock`,
        `${reason}. ${book.title} is available again.`,
        book.id,
        { bookId: book.id, genre: book.genre || null, author: book.author || null, reason },
        dedupeKey
      ]
    );
    return rowCount;
  });

  const results = await Promise.all(insertPromises);
  const created = results.reduce((sum, val) => sum + val, 0);

  return { created };
}

async function createUserNotification({ userId, type, title, body, bookId = null, data = {}, dedupeKey = null }) {
  if (!userId || !type || !title || !body) {
    return { created: 0 };
  }

  const { rowCount } = await query(
    `INSERT INTO notifications (user_id, type, title, body, book_id, data, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [userId, type, title, body, bookId, data, dedupeKey]
  );

  return { created: rowCount > 0 ? 1 : 0 };
}

async function getNotificationsForUser(userId, limit = 20) {
  const { rows } = await query(
    `SELECT n.*, b.title AS book_title, b.cover_url AS book_cover_url, b.cover_color AS book_cover_color, b.emoji AS book_emoji
     FROM notifications n
     LEFT JOIN books b ON b.id = n.book_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  const unreadCountResult = await query(
    `SELECT COUNT(*)::int AS unread_count
     FROM notifications
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );

  return {
    notifications: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      book_id: row.book_id,
      data: row.data || {},
      read_at: row.read_at,
      created_at: row.created_at,
      book: row.book_id ? {
        id: row.book_id,
        title: row.book_title,
        cover_url: row.book_cover_url,
        cover_color: row.book_cover_color,
        emoji: row.book_emoji
      } : null
    })),
    unreadCount: Number(unreadCountResult.rows[0]?.unread_count || 0)
  };
}

async function markNotificationRead(notificationId, userId) {
  const { rows } = await query(
    `UPDATE notifications
     SET read_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [notificationId, userId]
  );

  return rows[0] || null;
}

async function markAllNotificationsRead(userId) {
  await query(
    `UPDATE notifications
     SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
}

module.exports = {
  createBackInStockNotifications,
  createUserNotification,
  getNotificationsForUser,
  getRecommendationsForUser,
  getTasteProfile,
  markAllNotificationsRead,
  markNotificationRead,
  trackReadingEvent
};
