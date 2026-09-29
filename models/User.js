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
    bestScore: {
      type: Number,
      default: 0,
      index: -1, // -1 = index giảm dần, tối ưu cho truy vấn top
    },
    gamesPlayed: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
