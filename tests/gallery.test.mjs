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

