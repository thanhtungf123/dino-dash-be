import express from 'express';

import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// POST /api/scores — gửi điểm sau khi game over (cần đăng nhập)
// Chỉ ghi DB khi điểm mới CAO HƠN kỷ lục cũ => giảm tải ghi.
router.post('/scores', requireAuth, async (req, res) => {
  try {
    const score = Math.floor(Number(req.body.score));

    if (!Number.isFinite(score) || score < 0) {
      return res.status(400).json({ error: 'Điểm không hợp lệ.' });
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

// GET /api/leaderboard — Top 10 điểm cao nhất (công khai, guest xem được)
router.get('/leaderboard', async (req, res) => {
  try {
    const top = await User.find({ bestScore: { $gt: 0 } })
      .sort({ bestScore: -1, updatedAt: 1 })
      .limit(10)
      .select('username bestScore -_id')
      .lean();

    return res.json({ leaderboard: top });
  } catch (err) {
    console.error('leaderboard error:', err);
    return res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

export default router;
