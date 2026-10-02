// Tạo nhanh người chơi GIẢ + điểm cho MỘT THÁNG để test luồng chốt top / nhận thưởng.
//
// Cách chạy (trong thư mục backend):
//   node scripts/seed-test-season.js                 -> seed tháng TRƯỚC, 5 người
//   node scripts/seed-test-season.js 2026-09 8       -> seed tháng 2026-09, 8 người
//
// Sau khi chạy: vào admin -> "Quản lý Top & Thưởng" -> "Chốt tháng trước ngay"
// (hoặc "Chốt lại" nếu đã có thẻ mùa) rồi đăng nhập bằng các tài khoản test
// (mật khẩu: test1234) để thử điền thông tin nhận thưởng.
//
// ⚠️ CHỈ chạy trên DATABASE TEST (xem hướng dẫn tách DB), tránh ghi dữ liệu giả
//    vào DB thật đang chạy website.

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { User } from '../models/User.js';
import { MonthlyScore } from '../models/MonthlyScore.js';
import { previousMonthKey, monthKeyLabel } from '../lib/month.js';

const PASSWORD = 'test1234';
const arg = process.argv[2];
const monthKey = arg && /^\d{4}-\d{2}$/.test(arg) ? arg : previousMonthKey();
const count = Math.min(10, Math.max(3, parseInt(process.argv[3], 10) || 5));

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('✗ Thiếu MONGODB_URI trong .env');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  console.log(`Seed ${count} người chơi test cho tháng ${monthKeyLabel(monthKey)}:`);
  for (let i = 1; i <= count; i++) {
    const username = `testplayer${i}`;
    const score = (count - i + 1) * 100; // testplayer1 điểm cao nhất

    const user = await User.findOneAndUpdate(
      { username },
      { $setOnInsert: { username, passwordHash, role: 'user' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await MonthlyScore.findOneAndUpdate(
      { user: user._id, monthKey },
      {
        $set: { username, bestScore: score, gamesPlayed: i },
        $setOnInsert: { user: user._id, monthKey },
      },
      { upsert: true }
    );
    console.log(`  ${username} / ${PASSWORD}  ->  ${score} điểm`);
  }

  console.log(
    `\n✓ Xong. Vào admin → "Quản lý Top & Thưởng" → "Chốt tháng trước ngay" để chốt top,` +
      `\n  rồi đăng nhập bằng testplayer1/2/3 (mật khẩu ${PASSWORD}) để thử điền thông tin nhận thưởng.`
  );
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('✗ LỖI:', err.message);
  process.exit(1);
});
