import mongoose from 'mongoose';

/**
 * Người chơi. Điểm cao nhất được lưu ngay trên document để truy vấn
 * bảng xếp hạng cực nhanh (có index giảm dần trên bestScore).
 */
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    // Kỷ lục MỌI THỜI ĐẠI (không reset) — để hiển thị thành tích cá nhân.
    // Cuộc đua thưởng hàng tháng dựa trên MonthlyScore, không dùng field này.
    bestScore: {
      type: Number,
      default: 0,
      index: -1, // -1 = index giảm dần, tối ưu cho truy vấn top
    },
    // Tổng số ván đã chơi CẢ ĐỜI (không reset qua các tháng).
    gamesPlayed: {
      type: Number,
      default: 0,
    },
    // Tài khoản bị cấm do gian lận: không chơi/lưu điểm, báo lỗi khi đăng nhập.
    banned: {
      type: Boolean,
      default: false,
      index: true,
    },
    banReason: { type: String, default: '' },
    bannedAt: { type: Date },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
