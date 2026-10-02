// Dọn sạch dữ liệu test do seed-test-season.js tạo ra.
// Xóa: các tài khoản testplayer*, điểm theo tháng của họ, và những mùa giải
// chỉ gồm toàn người chơi test (an toàn — không đụng mùa giải/người chơi thật).
//
// Cách chạy (trong thư mục backend):  node scripts/clear-test-data.js

import 'dotenv/config';
import mongoose from 'mongoose';

import { User } from '../models/User.js';
import { MonthlyScore } from '../models/MonthlyScore.js';
import { Season } from '../models/Season.js';

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('✗ Thiếu MONGODB_URI trong .env');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const testUsers = await User.find({ username: /^testplayer\d+$/ })
    .select('_id')
    .lean();
  const ids = testUsers.map(u => u._id);

  const ms = await MonthlyScore.deleteMany({ user: { $in: ids } });
  const us = await User.deleteMany({ _id: { $in: ids } });

  // Chỉ xóa mùa giải mà TẤT CẢ winner đều là người chơi test.
  const seasons = await Season.find().lean();
  let seasonDeleted = 0;
  for (const s of seasons) {
    const winners = s.winners || [];
    if (
      winners.length &&
      winners.every(w => /^testplayer\d+$/.test(w.username || ''))
    ) {
      await Season.deleteOne({ _id: s._id });
      seasonDeleted += 1;
    }
  }

  console.log(
    `✓ Đã xóa: ${us.deletedCount} tài khoản test, ${ms.deletedCount} điểm tháng, ${seasonDeleted} mùa giải test.`
  );
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('✗ LỖI:', err.message);
  process.exit(1);
});
