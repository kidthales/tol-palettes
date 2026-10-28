import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemes } from '../tools/validate.mjs';
import { generateGalleryHtml, contrastRatio, escapeHtml } from '../tools/generate-gallery.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const galleryPath = join(root, 'dist', 'gallery', 'index.html');
const schemes = loadSchemes().map((x) => x.data);

test('dist/gallery/index.html is deterministic, attributed and has no external dependencies', () => {
  const html = readFileSync(galleryPath, 'utf8');
  assert.equal(html, generateGalleryHtml(schemes));
  assert.match(html, /Paul Tol/);
  assert.match(html, /NOTICE/);
  assert.match(html, /not affiliated with or endorsed by Paul Tol/);

  // Canonical URL & OpenGraph / Twitter metadata
  assert.match(html, /<link rel="canonical" href="https:\/\/tol-palettes\.kidthales\.com\/" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/tol-palettes\.kidthales\.com\/" \/>/);
  assert.match(html, /<meta name="twitter:card" content="summary" \/>/);

  // No external stylesheets, scripts, or images
  assert.doesNotMatch(html, /<link\b[^>]*rel="stylesheet"/i);
  assert.doesNotMatch(html, /<script\b[^>]*src=/i);
  assert.doesNotMatch(html, /<img\b[^>]*src=/i);
});

test('dist/gallery/CNAME exists and contains custom domain', () => {
  const cnamePath = join(root, 'dist', 'gallery', 'CNAME');
  const cname = readFileSync(cnamePath, 'utf8');
  assert.equal(cname, 'tol-palettes.kidthales.com\n');
});

test('gallery renders all 22 schemes with copyable hex buttons, contrast ratios and keyboard controls', () => {
  const html = readFileSync(galleryPath, 'utf8');

  // Accessible theme toggle and aria-live copy status region
  assert.match(html, /id="themeToggle"/);
  assert.match(html, /data-canvas-set="light"/);
  assert.match(html, /data-canvas-set="neutral"/);
  assert.match(html, /data-canvas-set="dark"/);
  assert.match(html, /role="status"\s+aria-live="polite"/);

  // Single-quote XSS escaping
  assert.equal(escapeHtml("Paul Tol's"), 'Paul Tol&#39;s');
  assert.equal(escapeHtml('<script>"foo" & \'bar\'</script>'), '&lt;script&gt;&quot;foo&quot; &amp; &#39;bar&#39;&lt;/script&gt;');

  // Visual copy feedback and modern sr-status clip-path
  assert.match(html, /\.copy-btn\.copied/);
  assert.match(html, /btn\.classList\.add\('copied'\)/);
  assert.match(html, /codeEl\.textContent = 'Copied!'/);
  assert.match(html, /clip-path:\s*inset\(50%\)/);

  for (const s of schemes) {
    assert.match(html, new RegExp(`id="scheme-${s.id}"`));
    assert.match(html, new RegExp(`href="#scheme-${s.id}"`));

    for (const c of [...s.colors, ...(s.extras ?? [])]) {
      assert.match(html, new RegExp(`data-copy-hex="${c.hex}"`));
      const vsWhite = contrastRatio(c.hex, '#FFFFFF').toFixed(2);
      const vsBlack = contrastRatio(c.hex, '#000000').toFixed(2);
      assert.ok(html.includes(`${vsWhite}:1`), `missing contrast vs white ${vsWhite}:1 for ${s.id} ${c.hex}`);
      assert.ok(html.includes(`${vsBlack}:1`), `missing contrast vs black ${vsBlack}:1 for ${s.id} ${c.hex}`);
    }
    if (s.bad) {
      assert.match(html, new RegExp(`data-copy-hex="${s.bad}"`));
    }
  }

  // Every colour in the 'dark' scheme must have contrast >= 4.5 against white (#FFFFFF)
  const dark = schemes.find((s) => s.id === 'dark');
  for (const c of dark.colors) {
    assert.ok(contrastRatio(c.hex, '#FFFFFF') >= 4.5, `dark scheme ${c.hex} contrast < 4.5 vs white`);
  }
});

test('canvas preview theme tokens and button contrast ratios meet WCAG AAA without masking swatches', () => {
  const html = readFileSync(galleryPath, 'utf8');

  // Swatch chips must not have destructive linear gradients that mask colors
  assert.doesNotMatch(html, /\.swatch-chip\s*\{[^}]*background-image/);
  assert.doesNotMatch(html, /\[data-canvas=[^\]]+\]\s*\.swatch-chip/);

  // Scoped --canvas-* tokens defined on :root and canvas modes
  assert.match(html, /--canvas-bg:\s*var\(--bg\);/);
  assert.match(html, /--canvas-card-bg:\s*var\(--bg\);/);
  assert.match(html, /--canvas-fg:\s*var\(--fg\);/);
  assert.match(html, /--canvas-muted:\s*var\(--muted\);/);
  assert.match(html, /--canvas-border:\s*var\(--border\);/);

  assert.match(html, /:root\[data-canvas='light'\]\s*\{[^}]*--canvas-bg:\s*#FFFFFF/);
  assert.match(html, /:root\[data-canvas='neutral'\]\s*\{[^}]*--canvas-bg:\s*#888888/);
  assert.match(html, /:root\[data-canvas='dark'\]\s*\{[^}]*--canvas-bg:\s*#111111/);

  // Active canvas toggle button contrast must be >= 7:1 (WCAG AAA)
  assert.match(
    html,
    /\.canvas-btn\[aria-pressed='true'\]\s*\{[^}]*background:\s*var\(--fg\);[^}]*color:\s*var\(--bg\);[^}]*border-color:\s*var\(--fg\);[^}]*font-weight:\s*700;/
  );

  // Light mode active button: #000000 on #FFFFFF (21:1 >= 7:1)
  assert.ok(contrastRatio('#000000', '#FFFFFF') >= 7.0);

  // Dark mode active button: #FFFFFF on #000000 (21:1 >= 7:1)
  assert.ok(contrastRatio('#FFFFFF', '#000000') >= 7.0);

  // Canvas text contrast: Light canvas (21:1)
  assert.ok(contrastRatio('#000000', '#FFFFFF') >= 7.0);
  // Dark canvas (18.45:1)
  assert.ok(contrastRatio('#FFFFFF', '#111111') >= 7.0);
  // Neutral canvas (5.92:1 >= 4.5:1 WCAG AA)
  assert.ok(contrastRatio('#000000', '#888888') >= 4.5);
  // Neutral canvas muted (5.20:1 >= 4.5:1 WCAG AA)
  assert.ok(contrastRatio('#111111', '#888888') >= 4.5);

  // Scheme cards and swatch cards must use canvas tokens
  assert.match(html, /\.scheme-card\s*\{[^}]*background:\s*var\(--canvas-bg\);/);
  assert.match(html, /\.scheme-card\s*\{[^}]*color:\s*var\(--canvas-fg\);/);
  assert.match(html, /\.scheme-card\s*\{[^}]*border:\s*1px solid var\(--canvas-border\);/);
  assert.match(html, /\.swatch-card\s*\{[^}]*background:\s*var\(--canvas-card-bg\);/);
  assert.match(html, /\.swatch-card\s*\{[^}]*color:\s*var\(--canvas-fg\);/);
  assert.match(html, /\.swatch-card\s*\{[^}]*border:\s*1px solid var\(--canvas-border\);/);
  assert.match(html, /\.swatch-chip\s*\{[^}]*border-block-end:\s*1px solid var\(--canvas-border\);/);
});
