import express from 'express';

import { MonthlyScore } from '../models/MonthlyScore.js';
import { Season } from '../models/Season.js';
import { User } from '../models/User.js';
import { requireAuth, requireAdmin, isAdmin } from '../middleware/auth.js';
import { monthKeyLabel, previousMonthKey } from '../lib/month.js';
import { closeSeason } from '../lib/seasons.js';
import { cleanText } from '../lib/sanitize.js';

const router = express.Router();

/** Escape ký tự đặc biệt để dùng chuỗi người dùng nhập làm regex an toàn. */
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==================== NGƯỜI CHƠI ====================

/**
 * GET /api/me/history
 * Lịch sử theo tháng của chính người đang đăng nhập: mỗi tháng kèm kỷ lục,
 * số ván, và (nếu lọt top) thứ hạng + trạng thái nhận thưởng.
 */
router.get('/me/history', requireAuth, async (req, res) => {
  try {
    const rows = await MonthlyScore.find({ user: req.userId })
      .sort({ monthKey: -1 })
      .lean();

    const keys = rows.map(r => r.monthKey);
    const seasons = await Season.find({ monthKey: { $in: keys } }).lean();
    const seasonByKey = new Map(seasons.map(s => [s.monthKey, s]));

    const history = rows.map(r => {
      const season = seasonByKey.get(r.monthKey);
      let winner = null;
      if (season) {
        const w = (season.winners || []).find(
          x => String(x.user) === String(req.userId)
        );
        if (w) {
          winner = {
            rank: w.rank,
            rewardAmount: w.reward?.amount || '',
            awarded: !!w.reward?.awarded,
            claimed: !!w.claim?.submittedAt,
            // Chỉ cho điền khi chưa trao thưởng.
            canClaim: !w.reward?.awarded,
          };
        }
      }
      return {
        monthKey: r.monthKey,
        label: monthKeyLabel(r.monthKey),
        bestScore: r.bestScore,
        gamesPlayed: r.gamesPlayed,
        closed: !!season,
        winner,
      };
    });

    return res.json({ history });
  } catch (err) {
    console.error('me/history error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * POST /api/me/claim
 * Người lọt top 3 tự điền thông tin nhận thưởng cho một tháng cụ thể.
 * Chỉ chủ tài khoản (và đúng người trong top) mới gọi được.
 */
router.post('/me/claim', requireAuth, async (req, res) => {
  try {
    const monthKey = String(req.body.monthKey || '');
    const season = await Season.findOne({ monthKey });
    if (!season) {
      return res.status(404).json({ error: 'Chưa có dữ liệu tháng này.' });
    }

    const w = (season.winners || []).find(
      x => String(x.user) === String(req.userId)
    );
    if (!w) {
      return res
        .status(403)
        .json({ error: 'Bạn không nằm trong top của tháng này.' });
    }
    if (w.reward?.awarded) {
      return res
        .status(400)
        .json({ error: 'Phần thưởng đã được trao, không thể sửa thông tin.' });
    }

    const claim = {
      fullName: cleanText(req.body.fullName, 100),
      phone: cleanText(req.body.phone, 30),
      bankName: cleanText(req.body.bankName, 100),
      bankAccount: cleanText(req.body.bankAccount, 50),
      note: cleanText(req.body.note, 300),
      submittedAt: new Date(),
    };

    if (!claim.fullName || !claim.bankName || !claim.bankAccount) {
      return res.status(400).json({
        error: 'Vui lòng điền họ tên, ngân hàng và số tài khoản.',
      });
    }

    w.claim = claim;
    await season.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('me/claim error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

// ==================== ADMIN ====================

/**
 * GET /api/admin/users?q=&page=&banned=
 * Danh sách người chơi (phân trang) để admin quản lý và cấm/bỏ cấm.
 * Chỉ trả thông tin cơ bản — KHÔNG kèm mật khẩu hay PII nhận thưởng.
 */
const USERS_PAGE_SIZE = 20;
router.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const filter = {};
    const q = cleanText(req.query.q, 40);
    if (q) filter.username = { $regex: escapeRegex(q), $options: 'i' };
    if (req.query.banned === 'true') filter.banned = true;

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * USERS_PAGE_SIZE)
      .limit(USERS_PAGE_SIZE)
      .select('username role bestScore gamesPlayed banned banReason bannedAt createdAt')
      .lean();

    return res.json({
      users: users.map(u => ({
        id: String(u._id),
        username: u.username,
        isAdmin: isAdmin(u),
        bestScore: u.bestScore,
        gamesPlayed: u.gamesPlayed,
        banned: !!u.banned,
        banReason: u.banReason || '',
        bannedAt: u.bannedAt || null,
        createdAt: u.createdAt,
      })),
      total,
      page,
      pageSize: USERS_PAGE_SIZE,
    });
  } catch (err) {
    console.error('admin/users error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * GET /api/admin/seasons
 * Danh sách mùa giải kèm ĐẦY ĐỦ thông tin nhận thưởng (PII) — chỉ admin.
 */
router.get('/admin/seasons', requireAdmin, async (req, res) => {
  try {
    // Dữ liệu nhạy cảm: không cho cache ở trình duyệt/proxy.
    res.set('Cache-Control', 'no-store');

    const seasons = await Season.find().sort({ monthKey: -1 }).lean();
    const out = seasons.map(s => ({
      monthKey: s.monthKey,
      label: monthKeyLabel(s.monthKey),
      status: s.status,
      auto: s.auto,
      closedAt: s.closedAt,
      disqualifiedUserIds: (s.disqualifiedUserIds || []).map(String),
      winners: (s.winners || []).map(w => ({
        rank: w.rank,
        userId: String(w.user),
        username: w.username,
        score: w.score,
        claim: w.claim?.submittedAt ? w.claim : null,
        reward: w.reward || { awarded: false },
      })),
    }));
    return res.json({ seasons: out });
  } catch (err) {
    console.error('admin/seasons error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * POST /api/admin/seasons/close
 * Chốt (hoặc chốt lại) một tháng. Mặc định chốt THÁNG TRƯỚC.
 */
router.post('/admin/seasons/close', requireAdmin, async (req, res) => {
  try {
    const monthKey = String(req.body.monthKey || previousMonthKey());
    await closeSeason(monthKey, { auto: false });
    return res.json({ ok: true, monthKey });
  } catch (err) {
    console.error('admin close season error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * POST /api/admin/seasons/:monthKey/disqualify
 * Loại một tài khoản khỏi top của tháng (gian lận) rồi tính lại top 3.
 */
router.post(
  '/admin/seasons/:monthKey/disqualify',
  requireAdmin,
  async (req, res) => {
    try {
      const { monthKey } = req.params;
      const userId = String(req.body.userId || '');
      if (!userId) {
        return res.status(400).json({ error: 'Thiếu userId.' });
      }

      const season = await Season.findOne({ monthKey });
      if (!season) {
        return res.status(404).json({ error: 'Không tìm thấy mùa giải.' });
      }

      const already = season.disqualifiedUserIds.map(String).includes(userId);
      if (!already) season.disqualifiedUserIds.push(userId);
      await season.save();

      // Tính lại top (đẩy người kế tiếp lên thay chỗ).
      await closeSeason(monthKey, { auto: false });
      return res.json({ ok: true });
    } catch (err) {
      console.error('admin disqualify error:', err);
      return res.status(500).json({ error: 'Lỗi máy chủ.' });
    }
  }
);

/**
 * POST /api/admin/seasons/:monthKey/award
 * Đánh dấu ĐÃ TRAO thưởng cho một người trong top.
 */
router.post('/admin/seasons/:monthKey/award', requireAdmin, async (req, res) => {
  try {
    const { monthKey } = req.params;
    const userId = String(req.body.userId || '');

    const season = await Season.findOne({ monthKey });
    if (!season) {
      return res.status(404).json({ error: 'Không tìm thấy mùa giải.' });
    }
    const w = (season.winners || []).find(x => String(x.user) === userId);
    if (!w) {
      return res.status(404).json({ error: 'Người này không trong top.' });
    }

    w.reward = w.reward || {};
    w.reward.awarded = true;
    w.reward.awardedAt = new Date();
    w.reward.awardedBy = req.user.username;

    if (season.winners.every(x => x.reward?.awarded)) {
      season.status = 'awarded';
    }
    await season.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin award error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/**
 * POST /api/admin/users/:id/ban
 * Cấm một tài khoản (gian lận): xóa điểm theo tháng để biến mất khỏi bảng
 * xếp hạng, và chặn đăng nhập/lưu điểm.
 */
router.post('/admin/users/:id/ban', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    }
    if (isAdmin(user)) {
      return res.status(400).json({ error: 'Không thể cấm tài khoản admin.' });
    }

    user.banned = true;
    user.banReason = cleanText(req.body.reason, 200) || 'Gian lận điểm';
    user.bannedAt = new Date();
    await user.save();

    // Gỡ khỏi bảng xếp hạng tháng (xóa toàn bộ điểm tháng của họ).
    await MonthlyScore.deleteMany({ user: user._id });
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin ban error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

/** POST /api/admin/users/:id/unban — bỏ cấm một tài khoản. */
router.post('/admin/users/:id/unban', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    }
    user.banned = false;
    user.banReason = '';
    user.bannedAt = undefined;
    await user.save();
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin unban error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
