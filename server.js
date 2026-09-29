import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth.js';
import scoreRoutes from './routes/scores.js';

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:8000';

// Chạy sau reverse proxy (Railway/Render) -> tin cậy header X-Forwarded-*
// để cookie "secure" được set đúng qua HTTPS.
app.set('trust proxy', 1);

// Cho phép frontend (khác cổng/domain) gọi API kèm cookie đăng nhập.
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', scoreRoutes); // => /api/scores, /api/leaderboard

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Đã kết nối MongoDB');

    app.listen(PORT, () => {
      console.log(`✓ API chạy tại http://localhost:${PORT}`);
      console.log(`  CORS cho phép origin: ${FRONTEND_ORIGIN}`);
    });
  } catch (err) {
    console.error('✗ Không thể khởi động server:', err.message);
    process.exit(1);
  }
}

start();
