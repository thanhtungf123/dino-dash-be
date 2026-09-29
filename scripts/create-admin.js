// Tạo (hoặc cập nhật) một tài khoản admin trực tiếp trong database.
// Cách chạy:  cd backend && node scripts/create-admin.js <username> <password>
// Không truyền tham số thì dùng mặc định bên dưới.
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { User } from '../models/User.js';

const username = process.argv[2] || 'tung121203';
const password = process.argv[3] || 'tung12122003';

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('✗ Thiếu MONGODB_URI trong .env');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.findOneAndUpdate(
    { username },
    {
      $set: { passwordHash, role: 'admin' },
      $setOnInsert: { bestScore: 0, gamesPlayed: 0 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(
    `✓ Tài khoản admin sẵn sàng: ${user.username} (role=${user.role})`
  );
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('✗ LỖI:', err.message);
  process.exit(1);
});
