import mongoose from 'mongoose';

/**
 * Điểm của một người chơi TRONG MỘT THÁNG.
 * Mỗi (user, monthKey) có đúng 1 bản ghi. Bảng xếp hạng tháng và lịch sử
 * đều tính từ collection này — sang tháng mới, query ra rỗng nên bảng tự
 * "về 0" mà không cần xóa/ghi đè dữ liệu cũ.
 */
const monthlyScoreSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Lưu kèm tên để hiển thị nhanh và bền vững nếu user đổi tên/bị xóa.
    username: { type: String, required: true },
    // "YYYY-MM" theo giờ Việt Nam.
    monthKey: { type: String, required: true },
    // Kỷ lục điểm trong tháng đó.
    bestScore: { type: Number, default: 0 },
    // Số ván đã chơi trong tháng đó.
    gamesPlayed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Mỗi người chỉ có 1 bản ghi cho mỗi tháng.
monthlyScoreSchema.index({ user: 1, monthKey: 1 }, { unique: true });
// Tối ưu truy vấn top: lọc theo tháng, sắp điểm giảm dần, phá hòa bằng
// thời điểm cập nhật (ai đạt mốc điểm trước thì xếp trên).
monthlyScoreSchema.index({ monthKey: 1, bestScore: -1, updatedAt: 1 });

export const MonthlyScore = mongoose.model('MonthlyScore', monthlyScoreSchema);
