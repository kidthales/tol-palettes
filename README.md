# @kidthales/tol-palettes

[![CI](https://github.com/kidthales/tol-palettes/actions/workflows/ci.yml/badge.svg)](https://github.com/kidthales/tol-palettes/actions/workflows/ci.yml)
[![Pages](https://github.com/kidthales/tol-palettes/actions/workflows/pages.yml/badge.svg)](https://tol-palettes.kidthales.com)
[![License: BSD-3-Clause](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg)](LICENSE)
[![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](package.json)

Colour scheme data inspired by and sourced from [Paul Tol's notes](https://sronpersonalpages.nl/~pault/), with multi-environment generators for **CSS**, **JavaScript / TypeScript**, **Python (`matplotlib`)**, **Godot 4.x**, and **GIMP / Aseprite**.

> *Independent project: not affiliated with or endorsed by Paul Tol.*

---

## Scope & Policy

- **Values only, with attribution.** The project stores colour values and structural lookup rules (`data/schemes/*.json`); it does not copy the notes' prose, figures, the PDF, or the LaTeX template.
- **No invented names.** A colour name appears only when the official `tol_colors.py` module provides one (the 6 qualitative schemes: `bright`, `high-contrast`, `vibrant`, `muted`, `medium-contrast`, `light`).
- **Single source of truth.** One hand-verified JSON file per scheme (22 schemes total) is the only canonical data layer; every environment output in `dist/` is deterministically generated from it.

---

## Installation & Quickstart

### Installation

#### npm (Public Registry — Zero Config)

Install directly from the npm public registry:

```bash
npm install @kidthales/tol-palettes
```

#### GitHub Packages (Alternative)

To install from GitHub Packages instead, configure the scope in your `.npmrc`:

```ini
@kidthales:registry=https://npm.pkg.github.com
```

Then install:

```bash
npm install @kidthales/tol-palettes
```


#### PyPI (Python Package)

Install directly from PyPI into your virtualenv or project:

```bash
pip install tol-palettes
```

With optional `matplotlib` colormap integration:

```bash
pip install "tol-palettes[matplotlib]"
```

#### CDN Delivery (jsDelivr / unpkg)

You can load CSS stylesheets, JavaScript modules, or JSON data directly in the browser via CDN without a build step:

**CSS Stylesheets:**
```html
<!-- Full 22-scheme bundle (jsDelivr) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes/dist/css/tol.css">

<!-- Individual scheme (e.g. bright palette via unpkg) -->
<link rel="stylesheet" href="https://unpkg.com/@kidthales/tol-palettes/dist/css/bright.css">
```

**JavaScript / ESM:**
```html
<script type="module">
  import { bright, interpolate } from "https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes/+esm";
  console.log(bright.colors);
</script>
```

**Raw JSON Data:**
```text
https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes/dist/json/schemes.json
https://unpkg.com/@kidthales/tol-palettes/dist/json/schemes.json
```

> [!NOTE]
> **SemVer 2.0.0 Pre-release**: Per SemVer 2.0.0 §4, versions in the `0.y.z` range denote initial development releases with evolving APIs. True stable releases begin at `v1.0.0`.

### JavaScript / TypeScript (ESM)
```ts
import { bright, muted, interpolate, discreteRainbow } from '@kidthales/tol-palettes';

console.log(bright.colors); // [{ hex: '#4477AA', name: 'blue' }, ...]
console.log(interpolate('sunset', 0.5)); // '#EAECCC'
console.log(discreteRainbow(5)); // ['#1965B0', '#7BAFDE', '#4EB265', '#F7F056', '#DC050C']
```

### CSS Custom Properties (`--tol-*`)
```css
/* Import an individual scheme or the full 22-scheme bundle */
@import '@kidthales/tol-palettes/css/bright.css';
@import '@kidthales/tol-palettes/css/tol.css';

.callout {
  background-color: var(--tol-pale-0);
  color: var(--tol-dark-3);
  border-left: 4px solid var(--tol-bright-blue);
}
```

### Python (`tol_palettes.py`)
```python
from tol_palettes import tol_cset, tol_cmap

bright = tol_cset("bright")
cmap = tol_cmap("sunset")  # Returns matplotlib colormap when matplotlib is installed
```

### Godot 4.x & Pixel Art (`dist/godot/`, `dist/aseprite/`, `dist/gpl/`, `dist/assets/`)
- **Godot 4.x Addon**: Extract `dist/assets/tol-palettes-godot.zip` into your project root to install `addons/tol_palettes/` with `plugin.cfg`, `tol_palettes.gd` (`TolPalettes`), and 22 `ColorPalette` `.tres` resources. See [`docs/game.md`](docs/game.md).
- **Aseprite & GPL Bundles**: Download `dist/assets/tol-palettes-aseprite.zip` or `tol-palettes-gpl.zip` for instant drag-and-drop palette loading in Aseprite, GIMP, Inkscape, or Krita.
- Download zip bundles directly from the [latest GitHub Release](https://github.com/kidthales/tol-palettes/releases).

---

## Layout & Generated Outputs

| Path | Command | Description |
|---|---|---|
| `data/schemes/*.json` | `npm run validate` | 22 verified scheme JSON files validated against `schema/scheme.schema.json` |
| `dist/css/` | `npm run generate:css` | Per-scheme CSS custom properties (`<id>.css`) and bundle (`tol.css`) — see [`docs/css.md`](docs/css.md) |
| `dist/js/` & `dist/json/` | `npm run generate:js` | Tree-shakeable ESM module (`index.js` + `index.d.ts`) and flat `schemes.json` — see [`docs/js.md`](docs/js.md) |
| `dist/py/` | `npm run generate:py` | Python module (`tol_palettes.py`) with optional `matplotlib` support — see [`docs/python.md`](docs/python.md) |
| `dist/gpl/`, `dist/aseprite/`, `dist/godot/` | `npm run generate:game` | GIMP/Aseprite `.gpl` palettes, Godot 4.x `tol_palettes.gd` and `ColorPalette` `.tres` resources — see [`docs/game.md`](docs/game.md) |
| `dist/assets/` | `npm run package:assets` | Downloadable `.zip` archives for Godot (`tol-palettes-godot.zip`), Aseprite, and GPL |
| `dist/gallery/` | `npm run generate:gallery` | Self-contained offline HTML reference gallery (`index.html`) with copyable hex codes and WCAG contrast ratios |

---

## Regenerating, Linting & Testing

```bash
npm run lint       # Validate schemas, JS syntax, attribution headers, and export resolution
npm run validate   # Validate all 22 scheme JSON files against schema + invariants
npm run generate   # Regenerate all outputs in dist/
npm test           # Run full linter, schema, CSS, JS/TS, Python, Game/Godot/GPL, Gallery, and packaging test suite
```

---

## License & Attribution

- **Project Code & Generators**: [BSD 3-Clause License](LICENSE) (`Copyright (c) 2026, kidthales`).
- **Colour Scheme Data**: Sourced from [Paul Tol's Notes](https://sronpersonalpages.nl/~pault/) and `tol_colors.py` (version 2022.10, `Copyright (c) 2022, Paul Tol`, 3-Clause BSD). See [`NOTICE`](NOTICE) for full attribution and the BSD licence notice, and [`docs/cvd-and-greyscale-scope.md`](docs/cvd-and-greyscale-scope.md) for the scope decision on colour-blindness and greyscale reference material.

