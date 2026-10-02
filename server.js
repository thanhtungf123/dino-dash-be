import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import scoreRoutes from './routes/scores.js';
import seasonRoutes from './routes/seasons.js';
import contentRoutes from './routes/content.js';
import settingsRoutes from './routes/settings.js';
import pageRoutes, { renderCustomPage } from './routes/pages.js';
import { Content } from './models/Content.js';
import { Page } from './models/Page.js';
import { ensureSeasonsClosed } from './lib/seasons.js';

// --- Kiểm tra biến môi trường bắt buộc, fail sớm với thông báo rõ ràng ---
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(
    `✗ Thiếu biến môi trường bắt buộc: ${missing.join(', ')}.\n` +
      '  Hãy đặt chúng trong file .env (local) hoặc phần Variables trên host.'
  );
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:8000';

// Danh sách origin được phép (có thể khai báo nhiều, ngăn cách bằng dấu phẩy).
const allowedOrigins = FRONTEND_ORIGIN.split(',')
  .map(s => s.trim())
  .filter(Boolean);
// Cho phép các URL preview *.vercel.app khi bật ALLOW_VERCEL_PREVIEWS=true.
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === 'true';

// Chạy sau reverse proxy (Railway/Render) -> tin cậy header X-Forwarded-*
// để cookie "secure" và rate-limit theo IP hoạt động đúng.
app.set('trust proxy', 1);

// Security headers. Tắt CORP (CORS lo phần này) và tắt CSP (tránh chặn ảnh
// Cloudinary / CDN trên trang SSR; XSS đã được lọc bằng sanitize-html).
app.use(
  helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false })
);

// CORS: chỉ cho phép origin trong danh sách (và preview Vercel nếu bật), kèm cookie.
app.use(
  cors({
    origin(origin, cb) {
      // Không có origin: request từ curl/health check -> cho qua.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (allowVercelPreviews) {
        try {
          if (/\.vercel\.app$/.test(new URL(origin).hostname)) {
            return cb(null, true);
          }
        } catch {
          /* origin không hợp lệ */
        }
      }
      // Không khớp: từ chối (không set header) -> trình duyệt sẽ chặn.
      return cb(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// --- Rate limiting ---
// Giới hạn chung cho toàn API (chống spam/DoS nhẹ).
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu, thử lại sau ít phút.' },
});
// Giới hạn chặt hơn cho đăng nhập/đăng ký (chống brute-force mật khẩu).
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 phút
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Quá nhiều lần thử, vui lòng chờ vài phút rồi thử lại.' },
});

app.use('/api', apiLimiter);

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Favicon động: chuyển hướng tới favicon hiện tại (Cloudinary) do admin đặt.
// Frontend hardcode <link rel="icon" href="/favicon.ico"> và Vercel rewrite về đây.
app.get('/favicon.ico', async (req, res) => {
  try {
    const doc = await Content.findOne({ key: 'site' }).lean();
    const url = doc?.data?.faviconUrl;
    if (url) return res.redirect(302, url);
  } catch {
    /* bỏ qua */
  }
  return res.status(204).end(); // chưa đặt favicon
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api', scoreRoutes); // => /api/scores, /api/leaderboard, /api/scores/session
app.use('/api', seasonRoutes); // => /api/me/history, /api/me/claim, /api/admin/seasons...
app.use('/api', contentRoutes); // => /api/content/:key
app.use('/api', settingsRoutes); // => /api/settings, /api/settings/upload
app.use('/api', pageRoutes); // => /api/pages (CRUD trang tùy biến)

// SSR trang tùy biến do admin tạo: /<slug> (đặt CUỐI, sau mọi route khác).
// Nginx proxy các path không phải file tĩnh/không phải /api về đây.
app.get('*', async (req, res) => {
  const slug = req.path.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!slug) return res.status(404).send('Not found');
  try {
    const page = await Page.findOne({ slug });
    if (page) {
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderCustomPage(page));
    }
  } catch (err) {
    console.error('render page error:', err);
  }
  return res.status(404).send('Not found');
});

// Tạo nội dung mặc định cho trang Giới thiệu / Phần thưởng nếu chưa có.
async function seedContent() {
  const defaults = {
    about: {
      title: 'Giới thiệu về Dino Dash',
      body:
        'Dino Dash là phiên bản game khủng long chạy (T-Rex Runner) kinh điển của trình duyệt Chrome — trò chơi xuất hiện khi bạn mất kết nối mạng. Chú khủng long sẽ chạy vô tận, nhiệm vụ của bạn là nhảy và cúi để vượt qua xương rồng và chim, đi càng xa càng tốt.\n\n' +
        'Ở Dino Dash, trò chơi được nâng cấp với hệ thống đăng nhập, lưu điểm và bảng xếp hạng trực tuyến, để bạn không chỉ chơi cho vui mà còn ganh đua thứ hạng với mọi người.\n\n' +
        'Trò chơi miễn phí, chạy trực tiếp trên trình duyệt, không cần cài đặt, mượt mà trên cả máy tính lẫn điện thoại.',
    },
    rewards: {
      title: 'Phần thưởng hàng tháng 🎁',
      intro:
        'Đăng nhập, cày điểm và leo lên top bảng xếp hạng. Cuối mỗi tháng, những tay chơi có điểm cao nhất sẽ nhận phần thưởng tiền mặt!',
      prizes: [
        { place: '🥇 Top 1', amount: '300.000đ' },
        { place: '🥈 Top 2', amount: '170.000đ' },
        { place: '🥉 Top 3', amount: '100.000đ' },
      ],
      rules:
        'Chương trình tính theo kỷ lục điểm cao nhất của mỗi tài khoản trong tháng.\n' +
        'Xếp hạng chốt vào ngày cuối cùng của tháng (23:59).\n' +
        'Ba tài khoản dẫn đầu bảng xếp hạng nhận thưởng theo mức ở trên.\n' +
        'Ban tổ chức có quyền hủy giải với tài khoản gian lận điểm hoặc dùng công cụ tự động.',
      contact: '[điền kênh liên hệ / trang Facebook / email của bạn]',
    },
    home: {
      title: 'Về Dino Dash',
      body:
        'Dino Dash là game khủng long chạy vượt chướng ngại vật, miễn phí ngay trên trình duyệt — không cần cài đặt.\n\n' +
        'Đăng nhập để lưu điểm, leo lên bảng xếp hạng và nhận quà hàng tháng. Chúc bạn chơi vui!',
    },
  };

  for (const [key, data] of Object.entries(defaults)) {
    const exists = await Content.findOne({ key });
    if (!exists) {
      await Content.create({ key, data });
      console.log(`  + Đã tạo nội dung mặc định: ${key}`);
    }
  }
}

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Đã kết nối MongoDB');
    await seedContent();

    // Tự chốt các tháng đã qua mà chưa có mùa giải (phần "tự động" của hybrid).
    try {
      const closed = await ensureSeasonsClosed();
      if (closed.length) console.log(`  + Đã tự chốt mùa: ${closed.join(', ')}`);
    } catch (err) {
      console.error('ensureSeasonsClosed (startup) error:', err);
    }

    app.listen(PORT, () => {
      console.log(`✓ API chạy tại http://localhost:${PORT}`);
      console.log(`  Origin được phép: ${allowedOrigins.join(', ')}`);
      if (allowVercelPreviews) console.log('  (đã bật preview *.vercel.app)');
    });
  } catch (err) {
    console.error('✗ Không thể khởi động server:', err.message);
    process.exit(1);
  }
}

start();
