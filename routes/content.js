import express from 'express';

import { Content } from '../models/Content.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

const ALLOWED_KEYS = ['about', 'rewards'];

// GET /api/content/:key — đọc nội dung (công khai, cho trang người chơi).
router.get('/content/:key', async (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.includes(key)) {
    return res.status(404).json({ error: 'Không tìm thấy nội dung.' });
  }
  const doc = await Content.findOne({ key }).lean();
  return res.json({ key, data: doc?.data || null });
});

// PUT /api/content/:key — cập nhật nội dung (chỉ admin).
router.put('/content/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.includes(key)) {
    return res.status(404).json({ error: 'Không tìm thấy nội dung.' });
  }
  const data = req.body?.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
  }
  const doc = await Content.findOneAndUpdate(
    { key },
    { data },
    { upsert: true, new: true }
  );
  return res.json({ key: doc.key, data: doc.data });
});

export default router;
