import { MonthlyScore } from '../models/MonthlyScore.js';
import { Season } from '../models/Season.js';
import { Content } from '../models/Content.js';
import { User } from '../models/User.js';
import { currentMonthKey } from './month.js';

const TOP_N = 3;

/** Lấy mức thưởng [top1, top2, top3] từ nội dung trang "Phần thưởng". */
async function rewardAmounts() {
  try {
    const doc = await Content.findOne({ key: 'rewards' }).lean();
    const prizes = doc?.data?.prizes || [];
    return prizes.map(p => p?.amount || '');
  } catch {
    return [];
  }
}

/** Danh sách _id của các tài khoản đang bị cấm. */
async function bannedUserIds() {
  const banned = await User.find({ banned: true }).select('_id').lean();
  return banned.map(u => u._id);
}

/**
 * Tính top N của một tháng, loại trừ các userId cho trước (bị cấm/bị loại).
 * Trả về mảng winner "mới" (chưa có claim/reward).
 */
export async function computeWinners(monthKey, excludeIds = []) {
  const amounts = await rewardAmounts();
  const rows = await MonthlyScore.find({
    monthKey,
    bestScore: { $gt: 0 },
    user: { $nin: excludeIds },
  })
    .sort({ bestScore: -1, updatedAt: 1 })
    .limit(TOP_N)
    .lean();

  return rows.map((r, i) => ({
    rank: i + 1,
    user: r.user,
    username: r.username,
    score: r.bestScore,
    reward: { amount: amounts[i] || '', awarded: false },
  }));
}

/**
 * Chốt (hoặc chốt lại) một tháng: tính top 3 và lưu/ghi đè Season.
 * - Loại người bị cấm và người trong danh sách disqualified.
 * - Giữ lại claim/trạng thái trao thưởng của winner vẫn còn trụ hạng.
 */
export async function closeSeason(monthKey, { auto = false } = {}) {
  const existing = await Season.findOne({ monthKey });
  const disq = existing?.disqualifiedUserIds || [];
  const banned = await bannedUserIds();
  const excludeIds = [...disq, ...banned];

  const fresh = await computeWinners(monthKey, excludeIds);

  if (existing) {
    // Bảo toàn claim + reward đã có cho những winner còn giữ hạng.
    const prevByUser = new Map(
      existing.winners.map(w => [String(w.user), w])
    );
    for (const w of fresh) {
      const prev = prevByUser.get(String(w.user));
      if (!prev) continue;
      if (prev.claim && prev.claim.submittedAt) w.claim = prev.claim;
      if (prev.reward) {
        w.reward = {
          amount: w.reward.amount || prev.reward.amount || '',
          awarded: !!prev.reward.awarded,
          awardedAt: prev.reward.awardedAt,
          awardedBy: prev.reward.awardedBy,
        };
      }
    }
    existing.winners = fresh;
    existing.closedAt = existing.closedAt || new Date();
    if (!auto) existing.auto = false;
    // Nếu không còn ai hoặc chưa trao đủ -> trạng thái về "closed".
    existing.status = fresh.length && fresh.every(w => w.reward?.awarded)
      ? 'awarded'
      : 'closed';
    await existing.save();
    return existing;
  }

  return Season.create({
    monthKey,
    auto,
    closedAt: new Date(),
    disqualifiedUserIds: [],
    winners: fresh,
  });
}

/**
 * Tự chốt mọi tháng ĐÃ QUA mà chưa có Season (phần "tự động" của cơ chế hybrid).
 * Gọi lúc server khởi động và gọi "lười" theo chu kỳ trong route leaderboard,
 * nên không cần cài thêm cron/scheduler trên host.
 *
 * Lưu ý: chuỗi "YYYY-MM" so sánh theo thứ tự chữ cái cũng chính là thứ tự
 * thời gian, nên phép so sánh < currentMonthKey() là đúng.
 */
export async function ensureSeasonsClosed() {
  const cur = currentMonthKey();
  const months = await MonthlyScore.distinct('monthKey', {
    monthKey: { $lt: cur },
    bestScore: { $gt: 0 },
  });
  if (!months.length) return [];

  const existing = await Season.find({ monthKey: { $in: months } })
    .select('monthKey')
    .lean();
  const have = new Set(existing.map(s => s.monthKey));
  const todo = months.filter(m => !have.has(m));

  for (const m of todo) {
    await closeSeason(m, { auto: true });
  }
  return todo;
}
