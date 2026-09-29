import jwt from 'jsonwebtoken';

import { User } from '../models/User.js';

/**
 * Chặn request nếu chưa đăng nhập.
 * Đọc JWT từ httpOnly cookie "token" và gắn req.userId.
 */
export function requireAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Bạn cần đăng nhập.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  }
}

// Danh sách username được cấp quyền admin (khai báo trên .env / Railway).
const ADMIN_USERNAMES = (process.env.ADMIN_USERNAMES || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

/** Một user có phải admin không: theo role trong DB HOẶC nằm trong ADMIN_USERNAMES. */
export function isAdmin(user) {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    ADMIN_USERNAMES.includes(String(user.username).toLowerCase())
  );
}

/** Chặn request nếu không phải admin. */
export async function requireAdmin(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Bạn cần đăng nhập.' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!isAdmin(user)) {
      return res.status(403).json({ error: 'Bạn không có quyền quản trị.' });
    }
    req.userId = user._id.toString();
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  }
}
