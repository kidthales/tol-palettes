// Generates a self-contained, offline-capable HTML gallery of all 22 Paul Tol
// schemes into dist/gallery/index.html.
// Uses the generated CSS custom properties from generate-css.mjs, renders
// copyable hex values, bad-data colours, interpolation gradients, and WCAG 2.x
// contrast ratios against white (#FFFFFF) and black (#000000).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemes } from './validate.mjs';
import { cssFor } from './generate-css.mjs';
import { hexToRgb } from './generate-js.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA, hexB) {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSwatchCard(schemeId, color, labelPrefix, cssVar) {
  const vsWhite = contrastRatio(color.hex, '#FFFFFF').toFixed(2);
  const vsBlack = contrastRatio(color.hex, '#000000').toFixed(2);
  const nameHtml = color.name ? ` <span class="swatch-name">${escapeHtml(color.name)}</span>` : '';
  const ariaLabel = `Copy ${color.hex} (${schemeId} ${labelPrefix}${color.name ? ' ' + color.name : ''})`;

  return `          <li class="swatch-card">
            <div class="swatch-chip" style="background-color: var(${cssVar}, ${color.hex});"></div>
            <div class="swatch-meta">
              <div class="swatch-head">
                <span class="swatch-idx">${escapeHtml(labelPrefix)}</span>${nameHtml}
              </div>
              <button type="button" class="copy-btn" data-copy-hex="${color.hex}" aria-label="${escapeHtml(ariaLabel)}">
                <code>${color.hex}</code>
              </button>
              <dl class="contrast-list">
                <div><dt>vs #FFF</dt><dd>${vsWhite}:1</dd></div>
                <div><dt>vs #000</dt><dd>${vsBlack}:1</dd></div>
              </dl>
            </div>
          </li>`;
}

function renderSchemeSection(s) {
  const cards = s.colors
    .map((c, i) => renderSwatchCard(s.id, c, `#${i}`, `--tol-${s.id}-${i}`))
    .join('\n');

  const extrasHtml =
    s.extras && s.extras.length > 0
      ? `        <div class="sub-block">
          <h4>Module extras (<code>tol_colors.py</code>)</h4>
          <ul class="swatch-grid">
${s.extras.map((c) => renderSwatchCard(s.id, c, 'extra', c.name ? `--tol-${s.id}-${c.name}` : `--tol-${s.id}-extra`)).join('\n')}
          </ul>
        </div>`
      : '';

  const badHtml = s.bad
    ? `        <div class="sub-block">
          <h4>Bad / missing data colour</h4>
          <ul class="swatch-grid">
${renderSwatchCard(s.id, { hex: s.bad }, 'bad', `--tol-${s.id}-bad`)}
          </ul>
        </div>`
    : '';

  const gradientHtml =
    s.interpolation !== 'none'
      ? `        <div class="gradient-bar" role="img" aria-label="Linear gradient preview for ${escapeHtml(s.id)}" style="background: var(--tol-${s.id}-gradient);"></div>`
      : '';

  const sourceParts = [];
  if (s.source.module) sourceParts.push(`<code>${escapeHtml(s.source.module)}</code> (${escapeHtml(s.source.moduleVersion || '2022.10')})`);
  if (s.source.siteFigure) sourceParts.push(`<code>${escapeHtml(s.source.siteFigure)}</code>`);

  return `      <section class="scheme-card" id="scheme-${escapeHtml(s.id)}" aria-labelledby="heading-${escapeHtml(s.id)}">
        <header class="scheme-header">
          <div>
            <h3 id="heading-${escapeHtml(s.id)}"><code>${escapeHtml(s.id)}</code></h3>
            <p class="scheme-sub">
              <span>Kind: <strong>${escapeHtml(s.kind)}</strong></span> ·
              <span>Stops: <strong>${s.colors.length}</strong></span> ·
              <span>Interpolation: <strong>${escapeHtml(s.interpolation)}</strong></span> ·
              <span>Source: ${sourceParts.join(' + ')}</span>
            </p>
          </div>
        </header>
${gradientHtml}
        <ul class="swatch-grid">
${cards}
        </ul>
${extrasHtml}
${badHtml}
      </section>`;
}

export function generateGalleryHtml(schemes = loadSchemes().map((x) => x.data)) {
  const sorted = [...schemes].sort((a, b) => a.id.localeCompare(b.id));
  const kinds = ['qualitative', 'diverging', 'sequential', 'special'];
  const cssTokens = sorted.map(cssFor).join('\n');

  const kindSections = kinds
    .map((kind) => {
      const group = sorted.filter((s) => s.kind === kind);
      const title = kind.charAt(0).toUpperCase() + kind.slice(1);
      return `    <section id="kind-${kind}" aria-labelledby="title-${kind}">
      <h2 id="title-${kind}">${title} schemes (${group.length})</h2>
${group.map(renderSchemeSection).join('\n')}
    </section>`;
    })
    .join('\n\n');

  const navLinks = sorted
    .map((s) => `          <li><a href="#scheme-${escapeHtml(s.id)}">${escapeHtml(s.id)}</a></li>`)
    .join('\n');

  return `<!doctype html>
<!--
  Colour values from Paul Tol's colour schemes (https://sronpersonalpages.nl/~pault/),
  with the 3-clause BSD notice for values derived from tol_colors.py. See NOTICE.
  Independent project: not affiliated with or endorsed by Paul Tol.
  Generated by tools/generate-gallery.mjs from data/schemes/*.json. Do not edit by hand.
-->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Paul Tol Colour Schemes — Reference Gallery (Values Only)</title>
    <link rel="canonical" href="https://tol-palettes.kidthales.com/" />
    <meta name="description" content="Interactive reference gallery for Paul Tol colour schemes: 22 colorblind-safe qualitative, diverging, and sequential palettes with WCAG contrast metrics." />
    <meta property="og:title" content="Paul Tol Colour Schemes — Reference Gallery" />
    <meta property="og:description" content="Interactive reference gallery for Paul Tol colour schemes: 22 colorblind-safe qualitative, diverging, and sequential palettes with WCAG contrast metrics." />
    <meta property="og:url" content="https://tol-palettes.kidthales.com/" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Paul Tol Colour Schemes — Reference Gallery" />
    <meta name="twitter:description" content="Interactive reference gallery for Paul Tol colour schemes: 22 colorblind-safe qualitative, diverging, and sequential palettes with WCAG contrast metrics." />
    <style>
${cssTokens}
      :root {
        color-scheme: light dark;
        --bg: light-dark(#FFFFFF, var(--tol-bright-black));
        --fg: light-dark(var(--tol-bright-black), #FFFFFF);
        --muted: light-dark(var(--tol-dark-10), var(--tol-light-pale_grey));
        --surface: light-dark(var(--tol-light-pale_grey), var(--tol-dark-10));
        --border: light-dark(var(--tol-dark-10), var(--tol-bright-grey));
        --link: light-dark(var(--tol-dark-3), var(--tol-bright-cyan));
        --focus: light-dark(var(--tol-dark-3), var(--tol-bright-yellow));
        --canvas-bg: var(--bg);
        --canvas-card-bg: var(--bg);
        --canvas-fg: var(--fg);
        --canvas-muted: var(--muted);
        --canvas-border: var(--border);
      }
      :root[data-theme='light'] { color-scheme: light; }
      :root[data-theme='dark'] { color-scheme: dark; }
      :root[data-canvas='light'] {
        --canvas-bg: #FFFFFF;
        --canvas-card-bg: #FFFFFF;
        --canvas-fg: var(--tol-bright-black);
        --canvas-muted: var(--tol-dark-10);
        --canvas-border: var(--tol-light-pale_grey);
      }
      :root[data-canvas='neutral'] {
        --canvas-bg: #888888;
        --canvas-card-bg: #888888;
        --canvas-fg: var(--tol-bright-black);
        --canvas-muted: #111111;
        --canvas-border: var(--tol-dark-10);
      }
      :root[data-canvas='dark'] {
        --canvas-bg: #111111;
        --canvas-card-bg: #111111;
        --canvas-fg: #FFFFFF;
        --canvas-muted: var(--tol-bright-grey);
        --canvas-border: var(--tol-dark-10);
      }
      .header-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
      .canvas-controls { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.8125rem; font-family: ui-monospace, monospace; }
      .canvas-btn { font-family: inherit; font-size: 0.75rem; padding: 0.2rem 0.5rem; border: 1px solid var(--border); border-radius: 0.25rem; background: var(--surface); color: var(--fg); cursor: pointer; }
      .canvas-btn[aria-pressed='true'] { background: var(--fg); color: var(--bg); border-color: var(--fg); font-weight: 700; }
      *, *::before, *::after { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.5;
        background: var(--bg);
        color: var(--fg);
      }
      a { color: var(--link); }
      code {
        font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
        font-size: 0.9em;
      }
      :focus-visible {
        outline: 3px solid var(--focus);
        outline-offset: 2px;
      }
      header.site-header, main, footer.site-footer {
        max-width: 72rem;
        margin-inline: auto;
        padding-inline: 1rem;
      }
      header.site-header {
        padding-block: 1rem;
        border-block-end: 1px solid var(--border);
      }
      .top-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      .theme-btn {
        font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
        font-size: 0.875rem;
        padding: 0.35rem 0.75rem;
        border: 1px solid var(--border);
        border-radius: 0.375rem;
        background: var(--surface);
        color: var(--fg);
        cursor: pointer;
      }
      nav.jump-nav ul {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 0.75rem;
        list-style: none;
        padding: 0;
        margin: 0.75rem 0 0;
        font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
        font-size: 0.8125rem;
      }
      .scheme-card {
        margin-block: 1.5rem;
        padding: 1rem;
        background: var(--canvas-bg);
        color: var(--canvas-fg);
        border: 1px solid var(--canvas-border);
        border-radius: 0.375rem;
      }
      .scheme-header h3 { margin: 0; font-size: 1.25rem; color: var(--canvas-fg); }
      .scheme-sub { margin: 0.25rem 0 0.75rem; color: var(--canvas-muted); font-size: 0.875rem; }
      .gradient-bar {
        height: 2rem;
        border: 1px solid var(--canvas-border);
        border-radius: 0.25rem;
        margin-block-end: 0.75rem;
      }
      .swatch-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
        gap: 0.75rem;
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .swatch-card {
        border: 1px solid var(--canvas-border);
        border-radius: 0.375rem;
        overflow: hidden;
        background: var(--canvas-card-bg);
        color: var(--canvas-fg);
      }
      .swatch-chip {
        height: 3.25rem;
        border-block-end: 1px solid var(--canvas-border);
      }
      .swatch-meta {
        padding: 0.5rem;
        font-size: 0.8125rem;
      }
      .swatch-head {
        display: flex;
        justify-content: space-between;
        gap: 0.25rem;
        margin-block-end: 0.25rem;
      }
      .swatch-idx { color: var(--canvas-muted); font-family: ui-monospace, monospace; }
      .swatch-name { font-weight: 700; color: var(--canvas-fg); }
      .copy-btn {
        width: 100%;
        text-align: start;
        padding: 0.2rem 0.4rem;
        margin-block-end: 0.35rem;
        border: 1px solid var(--canvas-border);
        border-radius: 0.25rem;
        background: var(--surface);
        color: var(--fg);
        cursor: pointer;
        transition: background-color 0.15s ease, border-color 0.15s ease;
      }
      .copy-btn.copied {
        border-color: var(--focus);
        background: var(--surface);
      }
      .contrast-list {
        margin: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--canvas-muted);
      }
      .contrast-list div { display: flex; flex-direction: column; }
      .contrast-list dt { font-weight: 600; }
      .contrast-list dd { margin: 0; font-family: ui-monospace, monospace; color: var(--canvas-fg); }
      .sub-block { margin-block-start: 1rem; }
      .sub-block h4 { margin: 0 0 0.5rem; font-size: 0.9375rem; color: var(--canvas-fg); }
      footer.site-footer {
        margin-block-start: 2rem;
        padding-block: 1.5rem;
        border-block-start: 1px solid var(--border);
        color: var(--muted);
        font-size: 0.875rem;
      }
      .sr-status {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        clip-path: inset(50%);
        border: 0;
        white-space: nowrap;
      }
    </style>
  </head>
  <body>
    <header class="site-header">
      <div class="top-bar">
        <div>
          <h1>Paul Tol Colour Schemes — Reference Gallery</h1>
          <p>22 schemes · Colour values only, with attribution · Click or press Enter on any hex code to copy.</p>
        </div>
        <div class="header-controls">
          <div class="canvas-controls" role="group" aria-label="Swatch canvas background">
            <span>Canvas:</span>
            <button type="button" class="canvas-btn" data-canvas-set="default" aria-pressed="true">Auto</button>
            <button type="button" class="canvas-btn" data-canvas-set="light" aria-pressed="false">Light</button>
            <button type="button" class="canvas-btn" data-canvas-set="neutral" aria-pressed="false">Neutral</button>
            <button type="button" class="canvas-btn" data-canvas-set="dark" aria-pressed="false">Dark</button>
          </div>
          <button type="button" class="theme-btn" id="themeToggle" aria-label="Toggle colour theme">
            [ Toggle theme ]
          </button>
        </div>
      </div>
      <nav class="jump-nav" aria-label="Scheme navigation">
        <ul>
${navLinks}
        </ul>
      </nav>
      <div id="copyStatus" class="sr-status" role="status" aria-live="polite"></div>
    </header>
    <main id="mainContent">
${kindSections}
    </main>
    <footer class="site-footer">
      <p>
        Colour values from <a href="https://sronpersonalpages.nl/~pault/">Paul Tol's Notes</a> and
        <code>tol_colors.py</code> (2022.10, 3-clause BSD; Copyright (c) 2022, Paul Tol).
        Independent project: not affiliated with or endorsed by Paul Tol. See <code>NOTICE</code>.
      </p>
    </footer>
    <script>
      (() => {
        const rootEl = document.documentElement;
        const toggleBtn = document.getElementById('themeToggle');
        const statusEl = document.getElementById('copyStatus');
        document.querySelectorAll('[data-canvas-set]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-canvas-set');
            if (mode === 'default') {
              delete rootEl.dataset.canvas;
            } else {
              rootEl.dataset.canvas = mode;
            }
            document.querySelectorAll('[data-canvas-set]').forEach((b) => {
              b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
            });
          });
        });
        toggleBtn?.addEventListener('click', () => {
          const isDark =
            rootEl.dataset.theme === 'dark' ||
            (!rootEl.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
          rootEl.dataset.theme = isDark ? 'light' : 'dark';
        });
        document.addEventListener('click', async (e) => {
          const btn = e.target.closest('[data-copy-hex]');
          if (!btn) return;
          const hex = btn.getAttribute('data-copy-hex');
          try {
            await navigator.clipboard.writeText(hex);
            if (statusEl) statusEl.textContent = 'Copied ' + hex;
            const codeEl = btn.querySelector('code');
            const originalText = codeEl ? codeEl.textContent : btn.textContent;
            btn.classList.add('copied');
            if (codeEl) codeEl.textContent = 'Copied!';
            setTimeout(() => {
              btn.classList.remove('copied');
              if (codeEl) codeEl.textContent = originalText;
            }, 1200);
          } catch (_) {}
        });
      })();
    </script>
  </body>
</html>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const galleryDir = join(root, 'dist', 'gallery');
  rmSync(galleryDir, { recursive: true, force: true });
  mkdirSync(galleryDir, { recursive: true });
  writeFileSync(join(galleryDir, 'index.html'), generateGalleryHtml());
  writeFileSync(join(galleryDir, 'CNAME'), 'tol-palettes.kidthales.com\n');
  console.log('Wrote dist/gallery/index.html and dist/gallery/CNAME.');
}
