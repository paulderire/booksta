const express = require('express');
const { query } = require('../db');

const router = express.Router();

async function ensureSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

router.get('/', async (_req, res, next) => {
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

router.put('/', async (req, res, next) => {
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

module.exports = router;