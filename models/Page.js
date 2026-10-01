import mongoose from 'mongoose';

/**
 * Trang do admin tự tạo (vd Liên hệ, Chính sách bảo mật).
 * Được Node render SSR tại đường dẫn /<slug> (meta/robots nằm trong View Source).
 */
const pageSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    title: { type: String, required: true, trim: true },
    metaDescription: { type: String, default: '' },
    body: { type: String, default: '' },
    noindex: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Page = mongoose.model('Page', pageSchema);
