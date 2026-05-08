const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, code, description, discount_type, discount_value, min_order_amount, max_uses, expires_at, is_active, created_at
       FROM promotions
       WHERE is_active = TRUE
         AND expires_at >= CURRENT_DATE
       ORDER BY created_at DESC`
    );

    res.json({ promotions: rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;