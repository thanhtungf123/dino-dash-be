import mongoose from 'mongoose';

/**
 * Nội dung website có thể chỉnh sửa qua trang quản trị.
 * Mỗi document là một khối nội dung (vd key='about', key='rewards').
 * data linh hoạt theo từng khối.
 */
const contentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Content = mongoose.model('Content', contentSchema);
