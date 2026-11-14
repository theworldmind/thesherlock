#!/usr/bin/env node
// THESHERLOCK CLI V7.0 — kendi sitelerinin tam ön yüz yedeği
// Bağımlılık gerektirmez (Node 18+). --render için isteğe bağlı: npm i playwright && npx playwright install chromium

import fs from 'node:fs/promises';
import path from 'node:path';

const VERSION = '7.0';
const HELP = `
THESHERLOCK CLI ${VERSION} — sitenin tüm sayfalarını ve dosyalarını yedekler

Kullanım:
  node sherlock.mjs <url> [seçenekler]

Seçenekler:
  --pages N          En fazla N sayfa tara (varsayılan 200)
  --out KLASÖR       Çıktı klasörü (varsayılan ./sherlock_<alanadı>_<tarih>)
  --render           Sayfaları gerçek tarayıcıda (Playwright) aç; JS ile oluşan içerik,
                     sonradan yüklenen dosyalar ve API yanıtları da kaydedilir
  --chrome YOL       --render için kullanılacak Chrome/Chromium yolu (isteğe bağlı)
  --no-images        Görselleri indirme
  --max-file MB      Tek dosya üst sınırı (varsayılan 50)
  --concurrency N    Aynı anda istek sayısı (varsayılan 4)
  --delay MS         İstekler arası bekleme (varsayılan 100)
  --ignore-robots    robots.txt Disallow kurallarını yok say (yalnızca kendi sitende)
  --help             Bu yardımı göster

Örnek:
  node sherlock.mjs https://neyapsak.co --render --pages 300
`;

/* ---------------- argümanlar ---------------- */
function parseArgs(argv) {
  const o = { pages: 200, render: false, images: true, maxFileMb: 50, concurrency: 4, delay: 100, robots: true };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) fail(`${a} için değer eksik`); return argv[++i]; };
    if (a === '--help' || a === '-h') { console.log(HELP); process.exit(0); }
    else if (a === '--pages') o.pages = Math.max(1, parseInt(next(), 10) || 200);
    else if (a === '--out') o.out = next();
    else if (a === '--render') o.render = true;
    else if (a === '--chrome') o.chrome = next();
    else if (a === '--no-images') o.images = false;
    else if (a === '--max-file') o.maxFileMb = Math.max(1, parseFloat(next()) || 50);
    else if (a === '--concurrency') o.concurrency = Math.min(16, Math.max(1, parseInt(next(), 10) || 4));
    else if (a === '--delay') o.delay = Math.max(0, parseInt(next(), 10) || 0);
    else if (a === '--ignore-robots') o.robots = false;
    else if (a.startsWith('--')) fail(`Bilinmeyen seçenek: ${a}`);
    else rest.push(a);
  }
  if (!rest.length) { console.log(HELP); process.exit(1); }
  o.url = rest[0];
  return o;
}

function fail(msg) { console.error('Hata: ' + msg); process.exit(1); }

/* ---------------- URL yardımcıları ---------------- */
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|gbraid|wbraid|dclid|msclkid|yclid|igshid|mc_cid|mc_eid|_ga|_gl|ref_src|si)$/i;
const NON_PAGE_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|bmp|css|m?js|map|xml|json|txt|zip|rar|7z|gz|mp4|webm|mov|mp3|wav|ogg|woff2?|ttf|otf|eot)$/i;
const FONT_EXT = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i;
const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp)(\?|#|$)/i;

function cleanUrl(raw) {
  let u = String(raw).trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const p = new URL(u);
  [...p.searchParams.keys()].forEach(k => { if (TRACKING.test(k)) p.searchParams.delete(k); });
  p.hash = '';
  return p;
}

function abs(raw, base) {
  if (!raw) return null;
  const r = String(raw).trim().replace(/&amp;/g, '&');
  if (!r || /^(data:|blob:|javascript:|mailto:|tel:|about:|#)/i.test(r)) return null;
  try {
    const u = new URL(r, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    return u;
  } catch { return null; }
}

const pageKey = u => u.origin + (u.pathname.replace(/\/+$/, '') || '');

function kindOf(url, contentType = '') {
  const p = url.pathname.toLowerCase();
  const t = contentType.toLowerCase();
  if (/\.map$/.test(p)) return 'map';
  if (/\.css$/.test(p) || t.includes('text/css')) return 'css';
  if (/\.m?js$/.test(p) || t.includes('javascript')) return 'js';
  if (FONT_EXT.test(p) || t.includes('font')) return 'font';
  if (IMG_EXT.test(p) || t.startsWith('image/')) return 'image';
  if (t.includes('json')) return 'data';
  if (t.startsWith('video/') || t.startsWith('audio/')) return 'media';
  return 'other';
}

/* ---------------- dosya yolları ---------------- */
const usedPaths = new Set();
function safeSeg(s) {
  let d = s;
  try { d = decodeURIComponent(s); } catch {}
  d = d.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  return (!d || /^\.+$/.test(d)) ? '_' : d;
}
function hash36(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function localPath(u, root) {
  const segs = u.pathname.split('/').filter(Boolean).map(safeSeg);
  if (root === 'pages' || root === 'offline' || root === 'rendered') {
    if (u.search) segs.push('_q' + hash36(u.search));
    segs.push('index.html');
  } else {
    if (!segs.length || u.pathname.endsWith('/')) segs.push('index');
    if (u.search) {
      const last = segs.pop();
      const dot = last.lastIndexOf('.');
      const tag = '_q' + hash36(u.search);
      segs.push(dot > 0 ? last.slice(0, dot) + tag + last.slice(dot) : last + tag);
    }
  }
  let p = [root, safeSeg(u.host), ...segs].join('/');
  const base = p;
  let n = 1;
  while (usedPaths.has(p)) p = base + '.' + (++n);
  usedPaths.add(p);
  return p;
}
function relPath(fromFile, toFile) {
  const a = fromFile.split('/').slice(0, -1), b = toFile.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return '../'.repeat(a.length - i) + b.slice(i).join('/');
}

/* ---------------- ağ ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = `Mozilla/5.0 (compatible; THESHERLOCK-CLI/${VERSION}; site backup)`;

async function get(url, opts, tries = 3) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, 'accept': '*/*' }, signal: AbortSignal.timeout(45000) });
      if ((res.status === 429 || res.status >= 500) && t < tries - 1) {
        const ra = parseInt(res.headers.get('retry-after') || '', 10);
        await sleep((ra > 0 ? ra * 1000 : 1500 * (t + 1)));
        continue;
      }
      const len = parseInt(res.headers.get('content-length') || '0', 10);
      if (len > opts.maxFileMb * 1048576) return { status: res.status, type: res.headers.get('content-type') || '', tooBig: true, finalUrl: res.url };
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > opts.maxFileMb * 1048576) return { status: res.status, type: res.headers.get('content-type') || '', tooBig: true, finalUrl: res.url };
      return { status: res.status, ok: res.ok, type: res.headers.get('content-type') || '', buf, finalUrl: res.url, headers: Object.fromEntries(res.headers) };
    } catch (e) {
      if (t === tries - 1) return { status: 0, error: e.name === 'TimeoutError' ? 'zaman aşımı' : (e.cause?.code || e.message) };
      await sleep(1000 * (t + 1));
    }
  }
}

async function pool(items, limit, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; await fn(items[idx], idx); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/* ---------------- robots & sitemap ---------------- */
async function readRobots(origin, opts) {
  const res = await get(origin + '/robots.txt', opts, 2);
  const out = { disallow: [], allow: [], sitemaps: [] };
  if (!res?.ok || !res.buf) return out;
  let applies = false;
  for (const line of res.buf.toString('utf8').split(/\r?\n/)) {
    const m = line.replace(/#.*/, '').match(/^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i);
    if (!m) continue;
    const [, key, val] = m;
    const k = key.toLowerCase();
    if (k === 'sitemap') out.sitemaps.push(val);
    else if (k === 'user-agent') applies = val === '*' || /sherlock/i.test(val);
    else if (applies && k === 'disallow' && val) out.disallow.push(val);
    else if (applies && k === 'allow' && val) out.allow.push(val);
  }
  return out;
}
function robotsAllowed(u, robots) {
  const p = u.pathname + u.search;
  const match = rule => {
    const re = new RegExp('^' + rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    return re.test(p);
  };
  const d = robots.disallow.filter(match).sort((a, b) => b.length - a.length)[0];
  const a = robots.allow.filter(match).sort((a, b) => b.length - a.length)[0];
  return !d || (a && a.length >= d.length);
}
async function readSitemaps(origin, list, opts) {
  const found = new Set();
  const queue = [...new Set([...list, origin + '/sitemap.xml'])];
  const seen = new Set();
  while (queue.length && seen.size < 30 && found.size < 20000) {
    const sm = queue.shift();
    if (seen.has(sm)) continue;
    seen.add(sm);
    const res = await get(sm, opts, 2);
    if (!res?.ok || !res.buf) continue;
    const xml = res.buf.toString('utf8');
    const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map(m => m[1].replace(/&amp;/g, '&'));
    if (/<sitemapindex/i.test(xml)) locs.forEach(l => queue.push(l));
    else locs.forEach(l => found.add(l));
  }
  return [...found];
}

/* ---------------- HTML/CSS/JS ayrıştırma ---------------- */
const ATTR_RE = /\b(src|href|poster|data-src|data-href|content|action|srcset|data-srcset|imagesrcset)\s*=\s*("([^"]*)"|'([^']*)')/gi;

function htmlBase(html, pageUrl) {
  const m = html.match(/<base\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i);
  return m ? (abs(m[1], pageUrl)?.href || pageUrl) : pageUrl;
}

// <script> ve <!-- --> gövdelerini maskeler; etiket nitelikleri korunur
function maskScripts(html) {
  const saved = [];
  const masked = html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)|<!--[\s\S]*?-->/gi, (all, open, body, close) => {
    saved.push(open ? body : all);
    return open ? `${open}\u0000S${saved.length - 1}\u0000${close}` : `\u0000S${saved.length - 1}\u0000`;
  });
  return { masked, restore: str => str.replace(/\u0000S(\d+)\u0000/g, (m, i) => saved[+i]) };
}

function extractFromHtml(rawHtml, pageUrl) {
  const html = maskScripts(rawHtml).masked;
  const base = htmlBase(html, pageUrl);
  const links = new Set(), assets = new Set();
  const tagRe = /<([a-z][a-z0-9-]*)\b([^>]*)>/gi;
  let t;
  while ((t = tagRe.exec(html)) !== null) {
    const tag = t[1].toLowerCase(), attrs = t[2];
    const get = name => { const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')); return m ? (m[2] ?? m[3]) : null; };
    if (tag === 'a' || tag === 'area') { const u = abs(get('href'), base); if (u) links.add(u.href); continue; }
    if (tag === 'link') {
      const rel = (get('rel') || '').toLowerCase();
      const u = abs(get('href'), base);
      if (!u) continue;
      if (/stylesheet|preload|modulepreload|prefetch|icon|apple-touch-icon|manifest|mask-icon/.test(rel)) assets.add(u.href);
      else if (rel === 'alternate' || rel === 'canonical' || rel === 'next' || rel === 'prev') links.add(u.href);
      continue;
    }
    if (tag === 'meta') {
      const prop = (get('property') || get('name') || '').toLowerCase();
      if (/og:image|twitter:image|msapplication-tileimage/.test(prop)) { const u = abs(get('content'), base); if (u) assets.add(u.href); }
      continue;
    }
    for (const name of ['src', 'data-src', 'poster']) { const u = abs(get(name), base); if (u) assets.add(u.href); }
    for (const name of ['srcset', 'data-srcset']) {
      const v = get(name);
      if (v) v.split(',').forEach(part => { const u = abs(part.trim().split(/\s+/)[0], base); if (u) assets.add(u.href); });
    }
    const style = get('style');
    if (style) cssRefs(style, base).forEach(u => assets.add(u));
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) cssRefs(m[1], base).forEach(u => assets.add(u));
  return { links: [...links], assets: [...assets], base };
}

function cssRefs(css, base) {
  const out = [];
  for (const m of css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/gi)) { const u = abs(m[1], base); if (u) out.push(u.href); }
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) { const u = abs(m[1], base); if (u) out.push(u.href); }
  return out;
}

function jsRefs(js, jsUrl) {
  const out = new Set();
  const u = new URL(jsUrl);
  for (const m of js.matchAll(/["'`](\/[A-Za-z0-9_\-.\/@~]{3,200}\.(?:m?js|css|json|woff2?|png|svg|webp|jpe?g))["'`]/g)) if (!m[1].startsWith('//')) out.add(u.origin + m[1]);
  const at = jsUrl.indexOf('/_next/');
  if (at !== -1) for (const m of js.matchAll(/["'`](static\/(?:chunks|css|media)\/[A-Za-z0-9_\-.\/@~\[\]]{3,200}\.(?:js|css|woff2?|png|svg))["'`]/g)) out.add(jsUrl.slice(0, at + 7) + m[1]);
  return [...out];
}

function sourceMapRef(text, url) {
  const m = text.slice(-600).match(/sourceMappingURL=([^\s*'"]+)/);
  if (!m || m[1].startsWith('data:')) return null;
  return abs(m[1], url)?.href || null;
}

function endpointTraces(text) {
  const out = new Set();
  const res = [
    /["'`]((?:https?|wss?):\/\/[a-zA-Z0-9.-]+\.[a-z]{2,}(?::\d+)?\/(?:api|graphql|v\d+|rest|rpc|trpc|ws)\b[^\s"'`<>\\]{0,120})["'`]/g,
    /["'`](\/(?:api|graphql|trpc|rest|rpc)(?:\/[A-Za-z0-9_\-.{}:$]+){0,8})["'`]/g,
    /["'`](https:\/\/[a-z0-9-]+\.(?:supabase\.co|firebaseio\.com|firebaseapp\.com|appspot\.com|amazonaws\.com|azurewebsites\.net|herokuapp\.com|vercel\.app|workers\.dev|netlify\.app)[^\s"'`<>\\]{0,100})["'`]/g
  ];
  for (const re of res) for (const m of text.matchAll(re)) out.add(m[1]);
  return out;
}

/* ---------------- çevrimdışı yeniden yazım ---------------- */
function rewriteCss(css, baseUrl, outFile, lookup) {
  const map = raw => {
    const u = abs(raw, baseUrl);
    if (!u) return null;
    const loc = lookup(u.href);
    return loc ? relPath(outFile, loc) : u.href;
  };
  return css
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (all, q, raw) => { const n = map(raw); return n ? `url("${n}")` : all; })
    .replace(/@import\s+(["'])([^"']+)\1/gi, (all, q, raw) => { const n = map(raw); return n ? `@import "${n}"` : all; });
}

function rewriteHtml(rawHtml, pageUrl, outFile, lookupAsset, lookupPage) {
  const mask = maskScripts(rawHtml);
  const html = mask.masked;
  const base = htmlBase(html, pageUrl);
  let out = html.replace(/<base\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, '')
    .replace(/\s(integrity|crossorigin)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  out = out.replace(ATTR_RE, (all, name, quoted, d, s) => {
    const val = d ?? s ?? '';
    const n = name.toLowerCase();
    const q = quoted[0];
    if (/srcset$/.test(n)) {
      const v = val.split(',').map(part => {
        const bits = part.trim().split(/\s+/);
        const u = abs(bits[0], base);
        if (u) { const loc = lookupAsset(u.href); bits[0] = loc ? relPath(outFile, loc) : u.href; }
        return bits.join(' ');
      }).join(', ');
      return ` ${name}=${q}${v}${q}`.slice(1);
    }
    if (n === 'content' && !/^(https?:)?\/\//i.test(val) && !val.startsWith('/')) return all;
    const u = abs(val, base);
    if (!u) return all;
    const page = (n === 'href' || n === 'action' || n === 'data-href') ? lookupPage(u) : null;
    const loc = page || lookupAsset(u.href);
    const nv = loc ? relPath(outFile, loc) : u.href;
    return `${name}=${q}${nv}${q}`;
  });
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (all, a, css, c) => a + rewriteCss(css, base, outFile, lookupAsset) + c);
  out = out.replace(/\bstyle\s*=\s*"([^"]*url\([^"]*)"/gi, (all, css) => `style="${rewriteCss(css, base, outFile, lookupAsset).replace(/url\("([^"]*)"\)/g, "url('$1')")}"`);
  out = out.replace(/\bstyle\s*=\s*'([^']*url\([^']*)'/gi, (all, css) => `style='${rewriteCss(css, base, outFile, lookupAsset)}'`);
  return `<!-- THESHERLOCK çevrimdışı kopya: ${pageUrl.replace(/--/g, '')} -->\n` + mask.restore(out);
}

/* ---------------- ana akış ---------------- */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const start = cleanUrl(opts.url);
  const origin = start.origin;
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const outDir = path.resolve(opts.out || `sherlock_${safeSeg(start.host)}_${stamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const write = async (rel, data) => {
    const full = path.join(outDir, rel);
    if (!full.startsWith(outDir + path.sep)) throw new Error('güvensiz yol: ' + rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  };

  const log = (...a) => console.log(...a);
  log(`\nTHESHERLOCK CLI ${VERSION}`);
  log(`Hedef : ${start.href}`);
  log(`Çıktı : ${outDir}`);
  log(`Mod   : ${opts.render ? 'render (gerçek tarayıcı)' : 'ham HTML'} · en fazla ${opts.pages} sayfa\n`);

  // tarayıcı
  let browser = null, context = null;
  if (opts.render) {
    try {
      const pw = await import('playwright');
      browser = await pw.chromium.launch({ headless: true, ...(opts.chrome ? { executablePath: opts.chrome } : {}) });
      context = await browser.newContext({ userAgent: undefined, viewport: { width: 1366, height: 900 } });
    } catch (e) {
      fail(`--render için Playwright gerekli.\n  npm i playwright && npx playwright install chromium\n(${e.message.split('\n')[0]})`);
    }
  }

  const robots = await readRobots(origin, opts);
  const sitemapUrls = await readSitemaps(origin, robots.sitemaps, opts);
  log(`robots.txt: ${robots.disallow.length} disallow kuralı${opts.robots ? '' : ' (yok sayılıyor)'} · sitemap: ${sitemapUrls.length} adres`);

  const manifest = [];
  const assetFiles = new Map();    // url -> local path
  const assetQueue = new Map();    // url -> {kind, guess}
  const pageFiles = new Map();     // pageKey -> {raw, rendered}
  const pages = [];
  const endpoints = new Set();
  const capturedApi = [];
  const skippedByRobots = [];

  const queue = [];
  const queued = new Set();
  const enqueuePage = href => {
    const u = abs(href, origin);
    if (!u || u.origin !== origin || NON_PAGE_EXT.test(u.pathname)) return;
    [...u.searchParams.keys()].forEach(k => { if (TRACKING.test(k)) u.searchParams.delete(k); });
    const key = pageKey(u) + (u.search || '');
    if (queued.has(key)) return;
    if (opts.robots && !robotsAllowed(u, robots)) { skippedByRobots.push(u.href); queued.add(key); return; }
    queued.add(key);
    queue.push(u.href);
  };
  const enqueueAsset = (href, guess = false) => {
    if (assetQueue.has(href) || assetFiles.has(href)) return;
    const u = new URL(href);
    if (!opts.images && IMG_EXT.test(u.pathname)) return;
    assetQueue.set(href, { guess });
  };

  const afterAsset = (url, kind, buf) => {
    if (kind !== 'css' && kind !== 'js') return;
    const text = buf.toString('utf8');
    const sm = sourceMapRef(text, url);
    if (sm) enqueueAsset(sm, true);
    if (kind === 'css') cssRefs(text, url).forEach(h => enqueueAsset(h));
    if (kind === 'js') { jsRefs(text, url).forEach(h => enqueueAsset(h, true)); endpointTraces(text).forEach(e => endpoints.add(e)); }
  };
  const apiSeen = new Set();

  enqueuePage(start.href);
  sitemapUrls.forEach(enqueuePage);

  // sayfalar
  let qi = 0;
  const crawlOne = async pageUrl => {
    const u = new URL(pageUrl);
    const rec = { url: pageUrl };
    const res = await get(pageUrl, opts);
    rec.http_status = res?.status || 0;
    let html = '';
    if (res?.buf && /html|xml/i.test(res.type || 'text/html')) {
      html = res.buf.toString('utf8');
      const p = localPath(u, 'pages');
      await write(p, res.buf);
      rec.html_path = p;
      rec.html_bytes = res.buf.length;
      manifest.push({ url: pageUrl, path: p, kind: 'page', bytes: res.buf.length, ok: true });
    } else {
      rec.error = res?.error || (res?.type ? 'HTML değil: ' + res.type : 'HTML alınamadı');
      manifest.push({ url: pageUrl, kind: 'page', ok: false, note: rec.error });
    }

    let rendered = '';
    if (context) {
      const page = await context.newPage();
      page.on('response', async r => {
        try {
          const ru = abs(r.url(), pageUrl);
          if (!ru || r.status() >= 400 || r.request().resourceType() === 'document') return;
          const type = r.headers()['content-type'] || '';
          const kind = kindOf(ru, type);
          if (kind === 'data' || ['xhr', 'fetch'].includes(r.request().resourceType())) {
            endpoints.add(`${r.request().method()} ${ru.href}`);
            if (capturedApi.length < 500 && kind === 'data' && !apiSeen.has(ru.href)) {
              apiSeen.add(ru.href);
              const body = await r.body().catch(() => null);
              if (body && body.length < 5 * 1048576) {
                const p = localPath(ru, 'api');
                await write(p.endsWith('.json') ? p : p + '.json', body);
                capturedApi.push({ url: ru.href, method: r.request().method(), path: p.endsWith('.json') ? p : p + '.json', bytes: body.length });
              }
            }
            return;
          }
          if (!assetFiles.has(ru.href) && kind !== 'other') {
            const body = await r.body().catch(() => null);
            if (body && body.length <= opts.maxFileMb * 1048576 && !assetFiles.has(ru.href)) {
              const p = localPath(ru, 'assets');
              assetFiles.set(ru.href, p);
              assetQueue.delete(ru.href);
              await write(p, body);
              manifest.push({ url: ru.href, path: p, kind, bytes: body.length, ok: true, via: 'render' });
              afterAsset(ru.href, kind, body);
            }
          }
        } catch {}
      });
      try {
        await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 45000 });
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight && y < 30000; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
          window.scrollTo(0, 0);
        });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        rendered = await page.content();
        const p = localPath(u, 'rendered');
        await write(p, rendered);
        rec.rendered_path = p;
        if (!html) { html = rendered; rec.note = 'yalnızca render edilmiş HTML'; }
      } catch (e) {
        rec.render_error = e.message.split('\n')[0];
      } finally {
        await page.close().catch(() => {});
      }
    }

    rec.title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    for (const src of [html, rendered]) {
      if (!src) continue;
      const ex = extractFromHtml(src, pageUrl);
      ex.links.forEach(enqueuePage);
      ex.assets.forEach(h => enqueueAsset(h));
      endpointTraces(src).forEach(e => endpoints.add(e));
    }
    pageFiles.set(pageKey(u) + (u.search || ''), { raw: rec.html_path, rendered: rec.rendered_path, url: pageUrl, html, renderedHtml: rendered });
    pages.push(rec);
    process.stdout.write(`\r  sayfa ${pages.length}/${Math.min(opts.pages, queued.size)}  ${pageUrl.slice(0, 90).padEnd(90)}`);
    if (opts.delay) await sleep(opts.delay);
  };

  let active = 0;
  const pageWorkers = Array.from({ length: opts.render ? Math.min(2, opts.concurrency) : opts.concurrency }, async () => {
    while (pages.length < opts.pages) {
      if (qi >= queue.length) {
        await sleep(200);
        if (qi >= queue.length && active === 0) return;
        continue;
      }
      if (qi >= opts.pages) return;
      const next = queue[qi++];
      active++;
      try { await crawlOne(next); } catch (e) { pages.push({ url: next, error: e.message }); }
      finally { active--; }
    }
  });
  await Promise.all(pageWorkers);
  process.stdout.write('\n');
  log(`Sayfalar tamam: ${pages.length} (keşfedilen ${queued.size})`);

  // varlıklar
  let done = 0;
  while (true) {
    const batch = [...assetQueue.entries()].filter(([u]) => !assetFiles.has(u));
    if (!batch.length) break;
    batch.forEach(([u]) => assetQueue.delete(u));
    await pool(batch, opts.concurrency, async ([url, meta]) => {
      const u = new URL(url);
      const res = await get(url, opts, meta.guess ? 1 : 3);
      done++;
      if (done % 5 === 0) process.stdout.write(`\r  dosya ${done} indirildi, kuyrukta ${assetQueue.size}   `);
      if (!res?.buf || !res.ok) {
        if (!meta.guess) manifest.push({ url, kind: kindOf(u, res?.type), ok: false, note: res?.tooBig ? 'dosya çok büyük' : (res?.error || 'HTTP ' + res?.status) });
        return;
      }
      if (meta.guess && /text\/html/i.test(res.type)) return;
      const kind = kindOf(u, res.type);
      const p = localPath(u, 'assets');
      assetFiles.set(url, p);
      await write(p, res.buf);
      manifest.push({ url, path: p, kind, bytes: res.buf.length, ok: true });
      afterAsset(url, kind, res.buf);
    });
  }
  process.stdout.write('\n');

  // çevrimdışı kopya
  const lookupAsset = href => assetFiles.get(href) || null;
  const offlinePaths = new Map();
  for (const [key, pf] of pageFiles) offlinePaths.set(key, localPath(new URL(pf.url), 'offline'));
  const lookupPage = u => offlinePaths.get(pageKey(u) + (u.search || '')) || offlinePaths.get(pageKey(u)) || null;

  const cssOut = new Map();
  for (const [href, p] of assetFiles) if (/\.css$/i.test(p) || manifest.find(m => m.url === href && m.kind === 'css')) cssOut.set(href, 'offline/_css/' + hash36(href) + '.css');
  const lookupOffline = href => cssOut.get(href) || (assetFiles.get(href) ? assetFiles.get(href) : null);
  for (const [href, out] of cssOut) {
    const text = await fs.readFile(path.join(outDir, assetFiles.get(href)), 'utf8').catch(() => null);
    if (text != null) await write(out, rewriteCss(text, href, out, lookupOffline));
  }
  let offlineCount = 0;
  const indexRows = [];
  for (const [key, pf] of pageFiles) {
    const src = pf.renderedHtml || pf.html;
    if (!src) continue;
    const out = offlinePaths.get(key);
    await write(out, rewriteHtml(src, pf.url, out, lookupOffline, lookupPage));
    offlineCount++;
    indexRows.push({ url: pf.url, out, title: pages.find(p => p.url === pf.url)?.title || '' });
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  await write('offline/index.html', `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Çevrimdışı kopya — ${esc(start.host)}</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:820px;margin:40px auto;padding:0 16px}li{margin:0 0 12px}small{color:#666;word-break:break-all}</style></head><body><h1>${esc(start.host)} — çevrimdışı kopya</h1><p>${offlineCount} sayfa · ${assetFiles.size} dosya · ${new Date().toLocaleString('tr-TR')}</p><ol>${indexRows.map(r => `<li><a href="${esc(relPath('offline/index.html', r.out))}">${esc(r.title || r.url)}</a><br><small>${esc(r.url)}</small></li>`).join('')}</ol></body></html>`);

  // rapor
  const ok = manifest.filter(m => m.ok);
  const byKind = {};
  ok.forEach(m => { byKind[m.kind] = (byKind[m.kind] || 0) + 1; });
  const totalBytes = ok.reduce((s, m) => s + (m.bytes || 0), 0);
  const report = {
    tool: `THESHERLOCK CLI ${VERSION}`,
    target_url: start.href,
    generated_at: new Date().toISOString(),
    mode: opts.render ? 'render' : 'raw',
    pages_found: queued.size,
    pages_crawled: pages.length,
    files_by_kind: byKind,
    total_bytes: totalBytes,
    offline_pages: offlineCount,
    endpoints: [...endpoints].sort(),
    captured_api_responses: capturedApi,
    skipped_by_robots: skippedByRobots,
    pages
  };
  await write('report.json', JSON.stringify(report, null, 2));
  await write('manifest.json', JSON.stringify(manifest, null, 2));
  await write('README.txt',
    `THESHERLOCK CLI ${VERSION} yedeği\nHedef: ${start.href}\nTarih: ${report.generated_at}\n\n` +
    `offline/   çevrimdışı gezilebilir kopya — offline/index.html dosyasından başla\n` +
    `pages/     her sayfanın sunucudan gelen ham HTML'i (dokunulmamış)\n` +
    (opts.render ? `rendered/  tarayıcıda JS çalıştıktan sonraki HTML\napi/       sayfa açılırken gelen JSON/API yanıtları\n` : '') +
    `assets/    JS, CSS, font, görsel, source map ve diğer dosyalar (alan adına göre)\n` +
    `manifest.json  özgün URL -> dosya eşlemesi ve indirilemeyenler\nreport.json    özet, endpoint izleri, sayfa listesi\n\n` +
    `En iyi görüntü için bu klasörde: python -m http.server 8000  ->  http://localhost:8000/offline/\n`);

  if (browser) await browser.close();

  const failed = manifest.filter(m => !m.ok).length;
  log(`\n✅ Tamamlandı`);
  log(`   ${pages.length} sayfa · ${ok.length} dosya · ${(totalBytes / 1048576).toFixed(1)} MB · ${failed} indirilemedi`);
  log(`   Türlere göre: ${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (endpoints.size) log(`   ${endpoints.size} endpoint izi${capturedApi.length ? `, ${capturedApi.length} API yanıtı kaydedildi` : ''}`);
  if (skippedByRobots.length) log(`   robots.txt nedeniyle atlanan: ${skippedByRobots.length} (kendi sitense --ignore-robots)`);
  log(`   Çevrimdışı kopya: ${path.join(outDir, 'offline', 'index.html')}\n`);
}

main().catch(e => { console.error('\nHata:', e.stack || e.message); process.exit(1); });
