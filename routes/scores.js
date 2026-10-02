import express from 'express';
import jwt from 'jsonwebtoken';

import { User } from '../models/User.js';
import { MonthlyScore } from '../models/MonthlyScore.js';
import { Season } from '../models/Season.js';
import { requireAuth } from '../middleware/auth.js';
import { currentMonthKey, monthKeyLabel } from '../lib/month.js';
import { ensureSeasonsClosed } from '../lib/seasons.js';

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

// --- Cache bảng xếp hạng (phần công khai) để giảm tải DB khi đông người ---
const LB_CACHE_TTL = 15000; // 15 giây
// Key cache = `${monthKey}:${limit}` để không lẫn dữ liệu giữa các tháng.
const lbCache = new Map();
function clearLbCache() {
  lbCache.clear();
}

// --- Tự chốt tháng "lười": chạy tối đa 1 lần mỗi vài phút ---
let lastEnsure = 0;
async function maybeEnsureSeasons() {
  if (Date.now() - lastEnsure < 5 * 60 * 1000) return;
  lastEnsure = Date.now();
  try {
    await ensureSeasonsClosed();
  } catch (err) {
    console.error('ensureSeasonsClosed error:', err);
  }
}

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
    // Tài khoản bị cấm (gian lận) -> không được lưu điểm.
    if (user.banned) {
      return res
        .status(403)
        .json({ error: 'Tài khoản của bạn đã bị cấm.', banned: true });
    }

    // Thống kê cả đời trên document User.
    user.gamesPlayed += 1;
    let allTimeImproved = false;
    if (score > user.bestScore) {
      user.bestScore = score;
      allTimeImproved = true;
    }
    await user.save();

    // Điểm theo THÁNG (dùng cho bảng xếp hạng & giải thưởng).
    const monthKey = currentMonthKey();
    const before = await MonthlyScore.findOneAndUpdate(
      { user: user._id, monthKey },
      {
        $setOnInsert: { user: user._id, monthKey },
        $set: { username: user.username },
        $inc: { gamesPlayed: 1 },
        $max: { bestScore: score },
      },
      { upsert: true, new: false }
    );
    const prevMonthlyBest = before?.bestScore ?? 0;
    const monthlyImproved = score > prevMonthlyBest;
    const monthlyBest = Math.max(prevMonthlyBest, score);

    // Có kỷ lục tháng mới -> xóa cache để bảng xếp hạng cập nhật ngay.
    if (monthlyImproved) clearLbCache();

    return res.json({
      improved: monthlyImproved,
      allTimeImproved,
      monthlyBest,
      bestScore: user.bestScore, // kỷ lục mọi thời đại
      gamesPlayed: user.gamesPlayed,
      monthKey,
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

// GET /api/leaderboard — Top của THÁNG HIỆN TẠI (công khai).
// Nếu đã đăng nhập, kèm hạng của bạn trong tháng.
router.get('/leaderboard', async (req, res) => {
  try {
    maybeEnsureSeasons(); // tự chốt tháng đã qua (không chặn response)

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const monthKey = currentMonthKey();
    const cacheKey = `${monthKey}:${limit}`;

    let top;
    const cached = lbCache.get(cacheKey);
    if (cached && Date.now() - cached.at < LB_CACHE_TTL) {
      top = cached.list;
    } else {
      top = await MonthlyScore.find({ monthKey, bestScore: { $gt: 0 } })
        .sort({ bestScore: -1, updatedAt: 1 })
        .limit(limit)
        .select('username bestScore -_id')
        .lean();
      lbCache.set(cacheKey, { list: top, at: Date.now() });
    }

    let me = null;
    const userId = optionalUserId(req);
    if (userId) {
      const mine = await MonthlyScore.findOne({ user: userId, monthKey })
        .select('username bestScore')
        .lean();
      if (mine) {
        const rank =
          mine.bestScore > 0
            ? (await MonthlyScore.countDocuments({
                monthKey,
                bestScore: { $gt: mine.bestScore },
              })) + 1
            : null;
        me = { username: mine.username, bestScore: mine.bestScore, rank };
      }
    }

    return res.json({
      leaderboard: top,
      me,
      monthKey,
      monthLabel: monthKeyLabel(monthKey),
    });
  } catch (err) {
    console.error('leaderboard error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

// GET /api/leaderboard/previous — Top 3 của THÁNG TRƯỚC đã chốt (công khai).
// Dùng cho khối "Top 3 tháng trước" ở trang chủ. Không trả thông tin cá nhân.
router.get('/leaderboard/previous', async (req, res) => {
  try {
    maybeEnsureSeasons();
    const season = await Season.findOne().sort({ monthKey: -1 }).lean();
    if (!season) return res.json({ season: null });

    return res.json({
      season: {
        monthKey: season.monthKey,
        label: monthKeyLabel(season.monthKey),
        winners: (season.winners || []).map(w => ({
          rank: w.rank,
          username: w.username,
          score: w.score,
        })),
      },
    });
  } catch (err) {
    console.error('previous season error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
