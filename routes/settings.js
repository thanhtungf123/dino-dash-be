import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

import { Content } from '../models/Content.js';
import { requireAdmin } from '../middleware/auth.js';

// .trim() để phòng trường hợp biến môi trường bị dính khoảng trắng thừa
// (dấu cách thừa trong api_secret sẽ làm sai chữ ký -> lỗi "Invalid Signature").
cloudinary.config({
  cloud_name: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
  api_key: (process.env.CLOUDINARY_API_KEY || '').trim(),
  api_secret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // tối đa 8MB (đủ cho ảnh nội dung từ điện thoại)
});

const router = express.Router();

// Giá trị mặc định khi chưa cấu hình.
const DEFAULTS = {
  siteName: 'Dino Dash',
  faviconUrl: '',
  logoUrl: '',
  footer: {
    copyright: '© 2026 Dino Dash. All rights reserved.',
    intro: '',
    links: [],
  },
};

// GET /api/settings — cấu hình website (công khai; frontend/SSR đọc để render).
router.get('/settings', async (req, res) => {
  const doc = await Content.findOne({ key: 'site' }).lean();
  const data = doc?.data || {};
  return res.json({
    data: { ...DEFAULTS, ...data, footer: { ...DEFAULTS.footer, ...(data.footer || {}) } },
  });
});

// PUT /api/settings — lưu cấu hình (chỉ admin).
router.put('/settings', requireAdmin, async (req, res) => {
  const data = req.body?.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ.' });
  }
  // Gộp (merge nông) với cấu hình hiện có để lưu từng phần không ghi đè phần khác
  // (vd lưu "Menu header" không làm mất logo/footer, và ngược lại).
  const existing = await Content.findOne({ key: 'site' }).lean();
  const merged = { ...(existing?.data || {}), ...data };
  const doc = await Content.findOneAndUpdate(
    { key: 'site' },
    { data: merged },
    { upsert: true, new: true }
  );
  return res.json({ data: doc.data });
});

// POST /api/settings/upload — upload ảnh (favicon/logo) lên Cloudinary (chỉ admin).
router.post(
  '/settings/upload',
  requireAdmin,
  upload.single('image'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Chưa chọn tệp ảnh.' });
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res
        .status(500)
        .json({ error: 'Chưa cấu hình Cloudinary trên máy chủ.' });
    }
    try {
      const url = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'dino-dash' },
          (err, result) => (err ? reject(err) : resolve(result.secure_url))
        );
        stream.end(req.file.buffer);
      });
      return res.json({ url });
    } catch (err) {
      console.error('cloudinary upload error:', err);
      return res.status(500).json({ error: 'Upload ảnh thất bại.' });
    }
  }
);

export default router;
