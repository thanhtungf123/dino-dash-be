import express from 'express';

import { Page } from '../models/Page.js';
import { requireAdmin } from '../middleware/auth.js';
import { cleanHtml } from '../lib/sanitize.js';

const router = express.Router();

const SITE_URL = process.env.SITE_URL || 'https://trochoikhunglong.com';

function esc(str) {
  return String(str ?? '').replace(
    /[&<>"']/g,
    ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        ch
      ]
  );
}

function paragraphsHtml(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// Render một trang tùy biến thành HTML đầy đủ (SSR) — meta/robots nằm trong View Source.
export function renderCustomPage(page) {
  const robots = page.noindex ? 'noindex, follow' : 'index, follow';
  return `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <title>${esc(page.title)} — Dino Dash</title>
    <meta name="description" content="${esc(page.metaDescription || '')}" />
    <link rel="canonical" href="${SITE_URL}/${esc(page.slug)}" />
    <meta name="robots" content="${robots}" />
    <link rel="icon" href="/favicon.ico" />
    <script type="module" src="/app/site-settings.js"></script>
    <link rel="stylesheet" href="/trex.css" />
    <link rel="stylesheet" href="/custom.css" />
  </head>
  <body>
    <nav class="site-nav">
      <a class="site-logo" href="/">🦖 Dino Dash</a>
      <ul class="nav-menu">
        <li data-nav="allGames"><a href="/all-games">Trò chơi</a></li>
        <li data-nav="howToPlay"><a href="/how-to-play.html">Cách chơi</a></li>
        <li data-nav="leaderboard"><a href="/leaderboard.html">Bảng xếp hạng</a></li>
        <li data-nav="rewards"><a href="/rewards.html">Phần thưởng</a></li>
        <li data-nav="about"><a href="/about.html">Giới thiệu</a></li>
        <li><a href="/profile.html">Hồ sơ</a></li>
      </ul>
    </nav>
    <main class="page">
      <h1 class="page-title">${esc(page.title)}</h1>
      <div class="page-root page-rte">${page.body || ''}</div>
      <p class="page-back"><a href="/">← Về trang chơi</a></p>
    </main>
    <footer class="site-footer">
      <p>© 2026 Dino Dash · Game khủng long chạy vượt chướng ngại vật.</p>
    </footer>
  </body>
</html>`;
}

const publicPage = p => ({
  id: p._id,
  slug: p.slug,
  title: p.title,
  metaDescription: p.metaDescription,
  body: p.body,
  noindex: p.noindex,
  showInMenu: p.showInMenu,
});

// --- Công khai: danh sách trang hiển thị trên menu header ---
// (đặt TRƯỚC '/pages' admin; chỉ trả slug + tiêu đề cho nav.)
router.get('/pages/menu', async (req, res) => {
  const pages = await Page.find({ showInMenu: true })
    .sort({ createdAt: 1 })
    .select('slug title')
    .lean();
  res.json({ pages: pages.map(p => ({ slug: p.slug, title: p.title })) });
});

// --- Admin CRUD (/api/pages) ---

router.get('/pages', requireAdmin, async (req, res) => {
  const pages = await Page.find().sort({ createdAt: -1 }).lean();
  res.json({ pages: pages.map(publicPage) });
});

router.post('/pages', requireAdmin, async (req, res) => {
  try {
    const slug = String(req.body.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const title = String(req.body.title || '').trim();
    if (!slug || !title) {
      return res.status(400).json({ error: 'Cần có slug và tiêu đề.' });
    }
    if (await Page.findOne({ slug })) {
      return res.status(409).json({ error: 'Slug đã tồn tại.' });
    }
    const page = await Page.create({
      slug,
      title,
      metaDescription: String(req.body.metaDescription || ''),
      body: cleanHtml(req.body.body),
      noindex: !!req.body.noindex,
      showInMenu: !!req.body.showInMenu,
    });
    res.status(201).json({ page: publicPage(page) });
  } catch (err) {
    console.error('create page error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

router.put('/pages/:id', requireAdmin, async (req, res) => {
  try {
    const update = {
      title: String(req.body.title || '').trim(),
      metaDescription: String(req.body.metaDescription || ''),
      body: cleanHtml(req.body.body),
      noindex: !!req.body.noindex,
      showInMenu: !!req.body.showInMenu,
    };
    const page = await Page.findByIdAndUpdate(req.params.id, update, {
      new: true,
    });
    if (!page) return res.status(404).json({ error: 'Không tìm thấy trang.' });
    res.json({ page: publicPage(page) });
  } catch (err) {
    console.error('update page error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

router.delete('/pages/:id', requireAdmin, async (req, res) => {
  const page = await Page.findByIdAndDelete(req.params.id);
  if (!page) return res.status(404).json({ error: 'Không tìm thấy trang.' });
  res.json({ ok: true });
});

export default router;
