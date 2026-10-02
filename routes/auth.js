import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { User } from '../models/User.js';
import { requireAuth, isAdmin } from '../middleware/auth.js';

const router = express.Router();

const TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 ngày

const IS_PROD = process.env.NODE_ENV === 'production';

/** Thông báo hiển thị cho tài khoản bị cấm (kèm lý do nếu có). */
function banMessage(user) {
  const base = 'Tài khoản của bạn đã bị cấm khỏi hệ thống do gian lận điểm.';
  return user.banReason ? `${base} Lý do: ${user.banReason}` : base;
}

/**
 * Cấu hình cookie chứa JWT. httpOnly => JavaScript client không đọc được (chống XSS).
 * - Local (http, cùng máy): sameSite 'lax', secure false.
 * - Production (2 service khác domain, https): cookie cross-site nên bắt buộc
 *   sameSite 'none' + secure true, nếu không trình duyệt sẽ chặn.
 */
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: IS_PROD ? 'none' : 'lax',
    secure: IS_PROD,
    maxAge: TOKEN_MAX_AGE,
  };
}

/** Tạo JWT cho một user. */
function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

/** Dữ liệu user trả về client (không kèm passwordHash). */
function publicUser(user) {
  return {
    id: user._id,
    username: user.username,
    bestScore: user.bestScore,
    gamesPlayed: user.gamesPlayed,
    isAdmin: isAdmin(user),
  };
}

// POST /api/auth/register — đăng ký tài khoản mới
router.post('/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (username.length < 3 || username.length > 20) {
      return res
        .status(400)
        .json({ error: 'Tên đăng nhập phải từ 3 đến 20 ký tự.' });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash });

    res.cookie('token', signToken(user), cookieOptions());
    return res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

// POST /api/auth/login — đăng nhập
router.post('/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    const user = await User.findOne({ username });
    if (!user) {
      return res
        .status(401)
        .json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res
        .status(401)
        .json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
    }

    // Tài khoản bị cấm (gian lận): báo rõ lý do, không cấp phiên.
    if (user.banned) {
      return res.status(403).json({ error: banMessage(user), banned: true });
    }

    res.cookie('token', signToken(user), cookieOptions());
    return res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

// POST /api/auth/logout — đăng xuất
router.post('/logout', (req, res) => {
  res.clearCookie('token', cookieOptions());
  return res.json({ ok: true });
});

// GET /api/auth/me — thông tin người đang đăng nhập
router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  }
  // Bị cấm giữa chừng dù còn cookie: chặn và báo lý do.
  if (user.banned) {
    res.clearCookie('token', cookieOptions());
    return res.status(403).json({ error: banMessage(user), banned: true });
  }
  return res.json({ user: publicUser(user) });
});

export default router;
