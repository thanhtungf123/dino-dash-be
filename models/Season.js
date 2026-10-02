import mongoose from 'mongoose';

/**
 * Một "mùa giải" = ảnh chụp kết quả của một tháng ĐÃ CHỐT.
 * Lưu top 3 (winners) kèm thông tin nhận thưởng và trạng thái trao thưởng.
 * Thông tin trong `claim` là dữ liệu cá nhân nhạy cảm (số tài khoản ngân hàng)
 * -> chỉ được trả về qua route dành cho admin.
 */
const winnerSchema = new mongoose.Schema(
  {
    rank: Number, // 1..3
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String, // snapshot tên lúc chốt
    score: Number, // kỷ lục trong tháng

    // Thông tin người chơi tự điền để nhận thưởng (PII — chỉ admin đọc).
    claim: {
      fullName: String,
      phone: String,
      bankName: String,
      bankAccount: String,
      note: String,
      submittedAt: Date,
    },

    // Trạng thái trao thưởng do admin cập nhật.
    reward: {
      amount: String, // mức thưởng (sao chép từ nội dung "Phần thưởng" lúc chốt)
      awarded: { type: Boolean, default: false },
      awardedAt: Date,
      awardedBy: String, // username admin đã trao
    },
  },
  { _id: false }
);

const seasonSchema = new mongoose.Schema(
  {
    monthKey: { type: String, required: true, unique: true }, // "YYYY-MM"
    closedAt: { type: Date, default: Date.now },
    auto: { type: Boolean, default: false }, // chốt tự động hay admin chốt tay
    status: {
      type: String,
      enum: ['closed', 'awarded'],
      default: 'closed',
    },
    // Những tài khoản bị admin loại (gian lận) -> không được tính vào top.
    disqualifiedUserIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ],
    winners: [winnerSchema],
  },
  { timestamps: true }
);

export const Season = mongoose.model('Season', seasonSchema);
