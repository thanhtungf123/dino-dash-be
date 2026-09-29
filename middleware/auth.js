import jwt from 'jsonwebtoken';

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
