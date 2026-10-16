import express from 'express';

import { Game } from '../models/Game.js';
import { Content } from '../models/Content.js';
import { requireAdmin } from '../middleware/auth.js';
import { cleanHtml } from '../lib/sanitize.js';

const router = express.Router();

const SITE_URL = process.env.SITE_URL || 'https://trochoikhunglong.com';

// Đường dẫn công khai (giữ ở hằng số để dễ đổi, vd sang /tro-choi).
export const LISTING_PATH = '/all-games'; // trang tổng hợp
export const GAME_PATH_PREFIX = '/games'; // chi tiết: /games/<slug>

const RELATED_LIMIT = 6; // số game liên quan hiển thị ở trang chi tiết

function esc(str) {
  return String(str ?? '').replace(
    /[&<>"']/g,
    ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        ch
      ]
  );
}

/**
 * Chuẩn hoá ô nhập iframe của admin: chấp nhận cả đoạn <iframe ... src="...">
 * lẫn chỉ mỗi URL. Trả về URL http/https sạch, hoặc '' nếu không hợp lệ.
 */
export function normalizeEmbedUrl(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  // Nếu dán nguyên thẻ <iframe>, rút src ra.
  const m = s.match(/src\s*=\s*["']([^"']+)["']/i);
  if (m) s = m[1].trim();
  // Hỗ trợ link dạng //play.gamepix.com -> thêm https:
  if (s.startsWith('//')) s = 'https:' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.toString();
  } catch {
    return '';
  }
}

// Nav dùng chung cho các trang SSR (khớp với các trang tĩnh).
function navHtml() {
  return `<nav class="site-nav">
      <a class="site-logo" href="/">🦖 Dino Dash</a>
      <ul class="nav-menu">
        <li data-nav="allGames"><a href="${LISTING_PATH}">Trò chơi</a></li>
        <li data-nav="howToPlay"><a href="/how-to-play.html">Cách chơi</a></li>
        <li data-nav="leaderboard"><a href="/leaderboard.html">Bảng xếp hạng</a></li>
        <li data-nav="rewards"><a href="/rewards.html">Phần thưởng</a></li>
        <li data-nav="about"><a href="/about.html">Giới thiệu</a></li>
        <li><a href="/profile.html">Hồ sơ</a></li>
      </ul>
    </nav>`;
}

function footerHtml() {
  return `<footer class="site-footer">
      <p>© 2026 Dino Dash · Game khủng long chạy vượt chướng ngại vật.</p>
    </footer>`;
}

function headHtml({ title, description, canonical, noindex }) {
  const robots = noindex ? 'noindex, follow' : 'index, follow';
  return `  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description || '')}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description || '')}" />
    <meta property="og:type" content="website" />
    <link rel="canonical" href="${esc(canonical)}" />
    <meta name="robots" content="${robots}" />
    <link rel="icon" href="/favicon.ico" />
    <script type="module" src="/app/site-settings.js"></script>
    <link rel="stylesheet" href="/trex.css" />
    <link rel="stylesheet" href="/custom.css" />
  </head>`;
}

// Thẻ card 1 game ở trang tổng hợp.
function gameCard(g) {
  const href = `${GAME_PATH_PREFIX}/${esc(g.slug)}`;
  const thumb = g.thumbnailUrl
    ? `<img src="${esc(g.thumbnailUrl)}" alt="${esc(g.title)}" loading="lazy" />`
    : '<span class="game-card-noimg">🎮</span>';
  const desc = g.shortDescription
    ? `<p class="game-card-desc">${esc(g.shortDescription)}</p>`
    : '';
  return `<a class="game-card" href="${href}">
      <span class="game-card-thumb">${thumb}</span>
      <span class="game-card-title">${esc(g.title)}</span>
      ${desc}
    </a>`;
}

/** Render trang tổng hợp trò chơi (SSR). */
export function renderGamesIndex(indexData, games) {
  const data = indexData || {};
  const h1 = data.title || 'Tổng hợp trò chơi';
  const title = data.metaTitle || `${h1} — Dino Dash`;
  const intro = data.intro ? `<div class="page-rte games-intro">${data.intro}</div>` : '';
  const grid = games.length
    ? `<div class="games-grid">${games.map(gameCard).join('')}</div>`
    : '<p class="lb-empty">Chưa có trò chơi nào.</p>';

  return `<!DOCTYPE html>
<html lang="vi">
${headHtml({
    title,
    description: data.metaDescription,
    canonical: SITE_URL + LISTING_PATH,
    noindex: false,
  })}
  <body>
    ${navHtml()}
    <main class="page games-index-page">
      <h1 class="page-title">${esc(h1)}</h1>
      ${intro}
      ${grid}
    </main>
    ${footerHtml()}
  </body>
</html>`;
}

// Khung iframe game (responsive) + nút toàn màn hình + lớp phủ "xoay máy".
function gameFrame(g) {
  if (!g.embedUrl) return '';
  const lsClass = g.requireLandscape ? ' needs-landscape' : '';
  return `<div class="game-frame${lsClass}" id="gameFrame">
        <iframe src="${esc(g.embedUrl)}" title="${esc(g.title)}"
          loading="lazy" allowfullscreen
          allow="fullscreen; autoplay; gamepad; focus-without-user-activation *"></iframe>
        <div class="rotate-overlay" aria-hidden="true">
          <div class="rotate-overlay-inner">
            <span class="rotate-icon">📱</span>
            <p>Xoay ngang điện thoại để chơi</p>
          </div>
        </div>
        <button type="button" class="game-fs-exit" aria-label="Thoát toàn màn hình">✕</button>
      </div>
      <div class="game-frame-actions">
        <button type="button" class="game-fs-btn" data-fs-target="gameFrame">⛶ Toàn màn hình</button>
      </div>`;
}

/** Render trang chi tiết 1 game (SSR). related = mảng game liên quan. */
export function renderGamePage(game, related) {
  const title = game.metaTitle || `${game.title} — Dino Dash`;
  const body = game.body ? `<div class="page-rte game-body">${game.body}</div>` : '';
  const relatedHtml = related && related.length
    ? `<section class="games-related">
        <h2>Trò chơi liên quan</h2>
        <div class="games-grid">${related.map(gameCard).join('')}</div>
      </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="vi">
${headHtml({
    title,
    description: game.metaDescription,
    canonical: `${SITE_URL}${GAME_PATH_PREFIX}/${esc(game.slug)}`,
    noindex: game.noindex,
  })}
  <body>
    ${navHtml()}
    <main class="page game-page">
      <p class="game-breadcrumb"><a href="${LISTING_PATH}">← Tất cả trò chơi</a></p>
      <h1 class="page-title">${esc(game.title)}</h1>
      ${gameFrame(game)}
      ${body}
      ${relatedHtml}
    </main>
    ${footerHtml()}
    <script src="/app/game-frame.js" defer></script>
  </body>
</html>`;
}

// --- Handler SSR (dùng ở server.js, đặt trước catch-all) ---

export async function gamesIndexHandler(req, res) {
  try {
    const [doc, games] = await Promise.all([
      Content.findOne({ key: 'games' }).lean(),
      Game.find({ published: true }).sort({ order: 1, createdAt: -1 }).lean(),
    ]);
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderGamesIndex(doc?.data, games));
  } catch (err) {
    console.error('render games index error:', err);
    return res.status(500).send('Lỗi máy chủ');
  }
}

export async function gameDetailHandler(req, res) {
  const slug = String(req.params.slug || '').toLowerCase();
  try {
    const game = await Game.findOne({ slug }).lean();
    // Chưa publish: chỉ coi như không tồn tại với khách (tránh lộ nháp).
    if (!game || !game.published) return res.status(404).send('Not found');
    const related = await Game.find({
      published: true,
      _id: { $ne: game._id },
    })
      .sort({ order: 1, createdAt: -1 })
      .limit(RELATED_LIMIT)
      .lean();
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderGamePage(game, related));
  } catch (err) {
    console.error('render game page error:', err);
    return res.status(500).send('Lỗi máy chủ');
  }
}

// --- Admin CRUD (/api/admin/games) ---

const publicGame = g => ({
  id: g._id,
  slug: g.slug,
  title: g.title,
  metaTitle: g.metaTitle,
  metaDescription: g.metaDescription,
  thumbnailUrl: g.thumbnailUrl,
  embedUrl: g.embedUrl,
  shortDescription: g.shortDescription,
  body: g.body,
  requireLandscape: g.requireLandscape,
  published: g.published,
  order: g.order,
  noindex: g.noindex,
});

function slugify(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Gom các trường từ body request về object đã làm sạch (dùng cho create/update).
function readGameBody(body) {
  return {
    title: String(body.title || '').trim(),
    metaTitle: String(body.metaTitle || '').trim(),
    metaDescription: String(body.metaDescription || '').trim(),
    thumbnailUrl: String(body.thumbnailUrl || '').trim(),
    embedUrl: normalizeEmbedUrl(body.embedUrl),
    shortDescription: String(body.shortDescription || '').trim(),
    body: cleanHtml(body.body),
    requireLandscape: !!body.requireLandscape,
    published: body.published === undefined ? true : !!body.published,
    order: Number.isFinite(Number(body.order)) ? Number(body.order) : 0,
    noindex: !!body.noindex,
  };
}

router.get('/admin/games', requireAdmin, async (req, res) => {
  const games = await Game.find().sort({ order: 1, createdAt: -1 }).lean();
  res.json({ games: games.map(publicGame) });
});

router.post('/admin/games', requireAdmin, async (req, res) => {
  try {
    const slug = slugify(req.body.slug);
    const fields = readGameBody(req.body);
    if (!slug || !fields.title) {
      return res.status(400).json({ error: 'Cần có slug và tên trò chơi.' });
    }
    if (await Game.findOne({ slug })) {
      return res.status(409).json({ error: 'Slug đã tồn tại.' });
    }
    const game = await Game.create({ slug, ...fields });
    res.status(201).json({ game: publicGame(game) });
  } catch (err) {
    console.error('create game error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

router.put('/admin/games/:id', requireAdmin, async (req, res) => {
  try {
    const update = readGameBody(req.body);
    if (!update.title) {
      return res.status(400).json({ error: 'Cần có tên trò chơi.' });
    }
    // Cho phép đổi slug (kiểm tra trùng với game khác).
    const newSlug = slugify(req.body.slug);
    if (newSlug) {
      const dup = await Game.findOne({ slug: newSlug, _id: { $ne: req.params.id } });
      if (dup) return res.status(409).json({ error: 'Slug đã tồn tại.' });
      update.slug = newSlug;
    }
    const game = await Game.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!game) return res.status(404).json({ error: 'Không tìm thấy trò chơi.' });
    res.json({ game: publicGame(game) });
  } catch (err) {
    console.error('update game error:', err);
    res.status(500).json({ error: 'Lỗi máy chủ.' });
  }
});

router.delete('/admin/games/:id', requireAdmin, async (req, res) => {
  const game = await Game.findByIdAndDelete(req.params.id);
  if (!game) return res.status(404).json({ error: 'Không tìm thấy trò chơi.' });
  res.json({ ok: true });
});

export default router;
