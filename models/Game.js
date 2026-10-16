import mongoose from 'mongoose';

/**
 * Trò chơi do admin thêm bằng cách nhúng iframe (vd từ my.gamepix.com).
 * Hiển thị ở trang tổng hợp /all-games và trang chi tiết /games/<slug> (SSR).
 * Toàn bộ nội dung (tiêu đề, meta, mô tả, iframe) admin tự sửa trên web.
 */
const gameSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    // Tên game: dùng cho H1, thẻ card ở trang tổng hợp, và title mặc định.
    title: { type: String, required: true, trim: true },
    // <title> riêng cho SEO (để trống = dùng title).
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    // Ảnh thu nhỏ hiển thị ở trang tổng hợp (upload qua Cloudinary).
    thumbnailUrl: { type: String, default: '' },
    // Link nhúng iframe của game (src), vd https://play.gamepix.com/<game>/embed...
    embedUrl: { type: String, default: '' },
    // Mô tả ngắn hiển thị dưới tên game ở trang tổng hợp.
    shortDescription: { type: String, default: '' },
    // Nội dung chi tiết (HTML giàu định dạng) hiển thị dưới game.
    body: { type: String, default: '' },
    // Game chỉ chơi tốt khi màn hình ngang -> hiện lớp phủ "xoay máy" khi để dọc trên mobile.
    requireLandscape: { type: Boolean, default: false },
    published: { type: Boolean, default: true },
    // Thứ tự sắp xếp ở trang tổng hợp (số nhỏ hiện trước).
    order: { type: Number, default: 0 },
    noindex: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Sắp xếp mặc định cho trang tổng hợp: order tăng dần, mới nhất trước.
gameSchema.index({ order: 1, createdAt: -1 });

export const Game = mongoose.model('Game', gameSchema);
