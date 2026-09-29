import express from 'express';
import jwt from 'jsonwebtoken';

import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// --- Cấu hình chống gian lận điểm ---
// Trần tuyệt đối: chặn giá trị vô lý (vd 999999) dù có/không có session.
const HARD_CAP = 100000;
// Số điểm tối đa hợp lý mỗi giây chơi (game tăng tốc dần, thực tế < 20/s).
const MAX_POINTS_PER_SEC = 30;
// Cộng thêm để không chặn nhầm ván ngắn.
const BASE_BUFFER = 300;
// Thời hạn của session token (1 ván không nên dài hơn mức này).
const SESSION_TTL_SECONDS = 30 * 60;

/**
 * POST /api/scores/session
 * Cấp "session token" khi bắt đầu một ván. Server dùng thời điểm cấp (iat)
 * để tính giới hạn điểm hợp lý lúc nộp -> chặn gửi điểm giả.
 */
router.post('/scores/session', requireAuth, (req, res) => {
  const sessionToken = jwt.sign(
    { uid: req.userId, kind: 'game-session' },
    process.env.JWT_SECRET,
    { expiresIn: SESSION_TTL_SECONDS }
  );
  return res.json({ sessionToken });
});

/**
 * Tính điểm tối đa hợp lý dựa trên session token (nếu hợp lệ).
 * Trả về null nếu không có token hợp lệ (sẽ chỉ áp HARD_CAP).
 */
function maxScoreFromSession(sessionToken, userId) {
  if (!sessionToken) return null;
  try {
    const payload = jwt.verify(sessionToken, process.env.JWT_SECRET);
    if (payload.kind !== 'game-session' || payload.uid !== userId) return null;
    const elapsedSec = Math.max(0, Math.floor(Date.now() / 1000 - payload.iat));
    return elapsedSec * MAX_POINTS_PER_SEC + BASE_BUFFER;
  } catch {
    return null; // hết hạn/không hợp lệ -> bỏ qua, chỉ dùng HARD_CAP
  }
}

// POST /api/scores — nộp điểm sau khi game over (cần đăng nhập).
// Chỉ ghi DB khi điểm mới CAO HƠN kỷ lục cũ => giảm tải ghi.
router.post('/scores', requireAuth, async (req, res) => {
  try {
    const score = Math.floor(Number(req.body.score));

    if (!Number.isFinite(score) || score < 0) {
      return res.status(400).json({ error: 'Điểm không hợp lệ.' });
    }

    // Chống gian lận: trần tuyệt đối + trần theo thời gian ván chơi.
    if (score > HARD_CAP) {
      return res.status(400).json({ error: 'Điểm vượt ngưỡng cho phép.' });
    }
    const timeCap = maxScoreFromSession(req.body.sessionToken, req.userId);
    if (timeCap !== null && score > timeCap) {
      return res
        .status(400)
        .json({ error: 'Điểm không hợp lệ với thời gian chơi.' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    }

    user.gamesPlayed += 1;
    let improved = false;
    if (score > user.bestScore) {
      user.bestScore = score;
      improved = true;
    }
    await user.save();

    return res.json({
      improved,
      bestScore: user.bestScore,
      gamesPlayed: user.gamesPlayed,
    });
  } catch (err) {
    console.error('submit score error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * Đọc user đang đăng nhập từ cookie (không bắt buộc).
 * Trả về userId hoặc null.
 */
function optionalUserId(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).sub;
  } catch {
    return null;
  }
}

// GET /api/leaderboard — Top 10 (công khai). Nếu đã đăng nhập, kèm hạng của bạn.
router.get('/leaderboard', async (req, res) => {
  try {
    // Cho phép ?limit (mặc định 10, tối đa 100) để trang bảng xếp hạng hiện nhiều hơn.
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const top = await User.find({ bestScore: { $gt: 0 } })
      .sort({ bestScore: -1, updatedAt: 1 })
      .limit(limit)
      .select('username bestScore -_id')
      .lean();

    let me = null;
    const userId = optionalUserId(req);
    if (userId) {
      const user = await User.findById(userId).select('username bestScore').lean();
      if (user) {
        // Hạng = số người điểm cao hơn + 1 (chỉ tính khi đã có điểm).
        const rank =
          user.bestScore > 0
            ? (await User.countDocuments({
                bestScore: { $gt: user.bestScore },
              })) + 1
            : null;
        me = { username: user.username, bestScore: user.bestScore, rank };
      }
    }

    return res.json({ leaderboard: top, me });
  } catch (err) {
    console.error('leaderboard error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
