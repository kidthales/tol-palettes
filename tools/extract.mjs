// Extracts colour values from Paul Tol's notes page and tol_colors.py into
// data/schemes/*.json and writes docs/crosscheck-report.md.
//
// Policy: values only. Nothing from the page's prose, figures, the PDF or the
// LaTeX template is stored. See NOTICE.
//
//   node tools/extract.mjs            write data + report
//   node tools/extract.mjs --check    exit 1 if upstream values differ from data/ (ignores "retrieved")
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://sronpersonalpages.nl/~pault/';
const MODULE_URL = 'https://sronpersonalpages.nl/~pault/data/tol_colors.py';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const retrieved = new Date().toISOString().slice(0, 10);
const HEX = /#[0-9A-Fa-f]{6}/g;
const up = (s) => s.toUpperCase();
const hexes = (s) => [...s.matchAll(HEX)].map((m) => up(m[0]));
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

// ---------- parse the notes page: one <details> hex text block per figure ----------
function parseSite(html) {
  const out = {};
  for (const m of html.matchAll(/<figure id="(fig:scheme_[a-z_0-9]+)">([\s\S]*?)<\/figure>/g)) {
    const det = m[2].match(/<details>[\s\S]*?<p>([\s\S]*?)<\/p>\s*<\/details>/);
    if (!det) continue;
    const text = det[1].replace(/<[^>]+>/g, '');
    const lists = [];
    for (const s of text.matchAll(/(?:([A-Za-z][A-Za-z0-9 \-]*?):\s*)?((?:'#[0-9A-Fa-f]{6}'(?:,\s*)?)+)/g)) {
      lists.push({ label: (s[1] ?? '').trim(), hex: hexes(s[2]) });
    }
    out[m[1]] = lists;
  }
  return out;
}

// ---------- parse tol_colors.py ----------
function parseModule(py) {
  const version = py.match(/__version__\s*=\s*"([^"]+)"/)[1];
  const csets = {};
  for (const m of py.matchAll(/colorset == '([a-z-]+)':\s*cset = namedtuple\('\w+',\s*'([^']+)'\)\s*return cset\(([^)]*)\)/g)) {
    const names = m[2].trim().split(/\s+/);
    const hex = hexes(m[3]);
    if (names.length !== hex.length) throw new Error(`cset ${m[1]}: ${names.length} names vs ${hex.length} values`);
    csets[m[1]] = { names, hex };
  }
  const maps = {};
  const defs = [...py.matchAll(/    def __(\w+)\(self[^)]*\):/g)];
  defs.forEach((d, i) => {
    const block = py.slice(d.index, i + 1 < defs.length ? defs[i + 1].index : py.length);
    const c = block.match(/clrs = \[([^\]]*)\]/);
    if (!c) return;
    const bad = [...block.matchAll(/set_bad\('(#[0-9A-Fa-f]{6})'\)/g)].map((b) => up(b[1]));
    maps[d[1]] = { hex: hexes(c[1]), bad };
  });
  const idx = py.match(/indexes = (\[\[[\s\S]*?\]\])\n\s+if lut/);
  const lut = idx ? JSON.parse(idx[1].replace(/\s+/g, '')) : null;
  return { version, csets, maps, lut };
}

function subseqIndexes(sub, full, what) {
  return sub.map((h) => {
    const i = full.indexOf(h);
    if (i < 0) throw new Error(`${what}: ${h} not found in the full list`);
    return i;
  });
}

// ---------- build ----------
function build(site, mod) {
  const schemes = [];
  const report = [];
  const siteUrl = (fig) => `${SITE}#${fig}`;
  const base = (extra) => ({ retrieved, ...extra });
  const note = (id, site_n, mod_n, result, detail = '') => report.push({ id, site: site_n, module: mod_n, result, detail });

  const siteList = (fig, label) => {
    const l = site[fig];
    if (!l) throw new Error(`missing site figure ${fig}`);
    return label ? l.find((x) => x.label === label) : l[0];
  };
  const siteBad = (fig) => {
    const l = (site[fig] ?? []).find((x) => /^Bad data/i.test(x.label));
    return l ? l.hex[0] : undefined;
  };

  // qualitative sets that exist in the module (names come only from the module)
  const qual = [
    ['bright', 'fig:scheme_bright', 'bright'],
    ['high-contrast', 'fig:scheme_highcontrast', 'high-contrast'],
    ['vibrant', 'fig:scheme_vibrant', 'vibrant'],
    ['muted', 'fig:scheme_muted', 'muted'],
    ['medium-contrast', 'fig:scheme_mediumcontrast', 'medium-contrast'],
    ['light', 'fig:scheme_light', 'light'],
  ];
  for (const [id, fig, mname] of qual) {
    const s = siteList(fig).hex;
    const m = mod.csets[mname];
    if (!same(s, m.hex.slice(0, s.length))) throw new Error(`${id}: site values are not a prefix of the module values`);
    const colors = s.map((hex, i) => ({ hex, name: m.names[i] }));
    const extras = m.hex.slice(s.length).map((hex, i) => ({ hex, name: m.names[s.length + i] }));
    const scheme = {
      id, kind: 'qualitative', colors, ...(extras.length ? { extras } : {}),
      ...(siteBad(fig) ? { bad: siteBad(fig) } : {}),
      interpolation: 'none',
      source: base({ siteFigure: fig, siteUrl: siteUrl(fig), module: `tol_cset('${mname}')`, moduleVersion: mod.version }),
    };
    schemes.push(scheme);
    note(id, s.length, m.hex.length, 'match', extras.length ? `module adds: ${extras.map((e) => e.name).join(', ')}` : '');
  }

  // qualitative, site only
  for (const [id, fig] of [['dark', 'fig:scheme_dark'], ['pale', 'fig:scheme_marking']]) {
    const s = siteList(fig).hex;
    schemes.push({ id, kind: 'qualitative', colors: s.map((hex) => ({ hex })), interpolation: 'none', source: base({ siteFigure: fig, siteUrl: siteUrl(fig) }) });
    note(id, s.length, '-', 'site only');
  }

  // ordered schemes present in both
  const ordered = [
    ['sunset', 'diverging', 'fig:scheme_sunset', 'sunset', 'sunset_discrete', 'either'],
    ['nightfall', 'diverging', 'fig:scheme_nightfall', 'nightfall', 'nightfall_discrete', 'either'],
    ['burd', 'diverging', 'fig:scheme_burd', 'BuRd', 'BuRd_discrete', 'either'],
    ['prgn', 'diverging', 'fig:scheme_prgn', 'PRGn', 'PRGn_discrete', 'either'],
    ['ylorbr', 'sequential', 'fig:scheme_ylorbr', 'YlOrBr', 'YlOrBr_discrete', 'either'],
    ['iridescent', 'sequential', 'fig:scheme_iridescent', 'iridescent', null, 'linear'],
  ];
  for (const [id, kind, fig, mname, dname, interp] of ordered) {
    const s = siteList(fig).hex;
    const m = mod.maps[mname];
    if (!same(s, m.hex)) throw new Error(`${id}: site and module values differ`);
    const sb = siteBad(fig);
    if (sb !== m.bad[0]) throw new Error(`${id}: bad-data colour differs (site ${sb}, module ${m.bad[0]})`);
    const scheme = { id, kind, colors: s.map((hex) => ({ hex })), bad: sb, interpolation: interp,
      source: base({ siteFigure: fig, siteUrl: siteUrl(fig), module: `tol_cmap('${mname}')`, moduleName: mname, moduleVersion: mod.version }) };
    let detail = '';
    if (dname) {
      const d = mod.maps[dname];
      if (!same(d.hex, s)) {
        scheme.discreteIndexes = subseqIndexes(d.hex, s, `${id} discrete`);
        detail = `discrete variant uses indexes ${scheme.discreteIndexes.join(',')}`;
      }
    }
    schemes.push(scheme);
    note(id, s.length, m.hex.length, 'match', detail);
  }

  // module only
  {
    const m = mod.maps.WhOrBr;
    schemes.push({ id: 'whorbr', kind: 'sequential', colors: m.hex.map((hex) => ({ hex })), bad: m.bad[0], interpolation: 'linear',
      source: base({ module: "tol_cmap('WhOrBr')", moduleName: 'WhOrBr', moduleVersion: mod.version, notes: ['Equals ylorbr with a white first colour.'] }) });
    note('whorbr', '-', m.hex.length, 'module only');
  }

  // sequential, site only
  {
    const fig = 'fig:scheme_incandescent';
    const s = siteList(fig).hex;
    schemes.push({ id: 'incandescent', kind: 'sequential', colors: s.map((hex) => ({ hex })), bad: siteBad(fig), interpolation: 'linear', source: base({ siteFigure: fig, siteUrl: siteUrl(fig) }) });
    note('incandescent', s.length, '-', 'site only');
  }

  // smooth rainbow with module sub-ranges
  {
    const fig = 'fig:scheme_rainbow_smooth';
    const s = siteList(fig).hex;
    const subranges = [];
    for (const name of ['rainbow_WhRd', 'rainbow_WhBr', 'rainbow_PuRd', 'rainbow_PuBr']) {
      const m = mod.maps[name];
      const from = s.indexOf(m.hex[0]);
      const to = from + m.hex.length - 1;
      if (from < 0 || !same(s.slice(from, to + 1), m.hex)) throw new Error(`${name} is not a contiguous run of the smooth rainbow`);
      subranges.push({ id: name, from, to, bad: m.bad[0] });
    }
    schemes.push({ id: 'rainbow-smooth', kind: 'sequential', colors: s.map((hex) => ({ hex })), bad: siteBad(fig), interpolation: 'linear', subranges,
      source: base({ siteFigure: fig, siteUrl: siteUrl(fig), module: "tol_cmap('rainbow_*')", moduleVersion: mod.version }) });
    note('rainbow-smooth', s.length, 34, 'match', subranges.map((r) => `${r.id}=${r.from}..${r.to}`).join(', '));
  }

  // discrete rainbow with lut
  {
    const fig = 'fig:scheme_rainbow_discrete';
    const all = siteList(fig, 'All colours').hex;
    const rd = mod.maps.rainbow_discrete;
    if (!same(all, rd.hex)) throw new Error('rainbow_discrete: site and module values differ');
    if (!mod.lut || mod.lut.length !== 23) throw new Error('rainbow_discrete: expected 23 index rows');
    const bad23 = (site[fig] ?? []).find((x) => /^Bad data/i.test(x.label)).hex[0];
    const lutBad = { '23': bad23 };
    schemes.push({ id: 'rainbow-discrete', kind: 'sequential', colors: all.map((hex) => ({ hex })), bad: rd.bad[1] ?? '#FFFFFF', interpolation: 'none', lut: mod.lut, lutBad,
      source: base({ siteFigure: fig, siteUrl: siteUrl(fig), module: "tol_cmap('rainbow_discrete', lut)", moduleName: 'rainbow_discrete', moduleVersion: mod.version }) });
    note('rainbow-discrete', all.length, rd.hex.length, 'match', `23 index rows from the module; bad for 23 = ${bad23}`);
  }

  // banded (site only)
  {
    const fig = 'fig:scheme_banded';
    const l = site[fig];
    const bad = siteBad(fig);
    for (const n of [12, 16, 20]) {
      const entry = l.find((x) => x.label === `Banded ${n} colours`);
      if (!entry || entry.hex.length !== n) throw new Error(`banded ${n}: expected ${n} colours`);
      schemes.push({ id: `banded-${n}`, kind: 'sequential', colors: entry.hex.map((hex) => ({ hex })), bad, interpolation: 'none', source: base({ siteFigure: fig, siteUrl: siteUrl(fig) }) });
      note(`banded-${n}`, n, '-', 'site only');
    }
  }

  // ground cover (site only)
  {
    const fig = 'fig:scheme_groundcover';
    const s = siteList(fig).hex;
    schemes.push({ id: 'groundcover', kind: 'special', colors: s.map((hex) => ({ hex })), interpolation: 'none', source: base({ siteFigure: fig, siteUrl: siteUrl(fig) }) });
    note('groundcover', s.length, '-', 'site only');
  }
  return { schemes, report };
}

function reportMarkdown(report, mod) {
  const rows = report.map((r) => `| ${r.id} | ${r.site} | ${r.module} | ${r.result} | ${r.detail} |`).join('\n');
  return `# Cross-check report (generated)

Generated by \`tools/extract.mjs\` on ${retrieved}. Do not edit by hand.

Sources compared: the notes page (${SITE}) and \`tol_colors.py\` ${mod.version}.
The accompanying PDF has **not** been compared yet.

"match" means every colour value, its order and the bad-data colour are identical in both sources.

| Scheme | Site colours | Module colours | Result | Notes |
|---|---|---|---|---|
${rows}
`;
}

function stable(s) {
  const c = JSON.parse(JSON.stringify(s));
  delete c.source.retrieved;
  return JSON.stringify(c);
}

const check = process.argv.includes('--check');
const [html, py] = await Promise.all([get(SITE), get(MODULE_URL)]);
const mod = parseModule(py);
const { schemes, report } = build(parseSite(html), mod);

const dir = join(root, 'data', 'schemes');
if (check) {
  let drift = 0;
  for (const s of schemes) {
    const f = join(dir, `${s.id}.json`);
    if (!existsSync(f) || stable(JSON.parse(readFileSync(f, 'utf8'))) !== stable(s)) {
      console.error(`DRIFT ${s.id}`);
      drift++;
    }
  }
  console.log(drift ? `${drift} scheme(s) differ from upstream.` : `No drift across ${schemes.length} schemes.`);
  process.exit(drift ? 1 : 0);
}
mkdirSync(dir, { recursive: true });
for (const s of schemes) writeFileSync(join(dir, `${s.id}.json`), JSON.stringify(s, null, 2) + '\n');
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs', 'crosscheck-report.md'), reportMarkdown(report, mod));
console.log(`Wrote ${schemes.length} scheme files and docs/crosscheck-report.md`);
