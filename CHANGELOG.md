# Changelog

All notable changes to `@kidthales/tol-palettes` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-10-18

### Documentation & Tooling
- Verified and documented complete 3-way alignment across the live website, Python reference module, and historical technote PDF (`colourschemes.pdf` Issue 3.2) in `docs/crosscheck-report.md`.
- Enhanced `tools/extract.mjs` to generate the 3-way crosscheck matrix automatically.
- Refreshed retrieval provenance timestamp (`retrieved: 2026-10-18`) across all 22 scheme files and regenerated all distribution artifacts in `dist/`.

## [0.1.0] - 2026-10-17

### Added
- Canonical JSON dataset (`data/schemes/*.json`) and JSON Schema (`schema/scheme.schema.json`) for all 22 Paul Tol colour schemes (qualitative, diverging, sequential, and special).
- Deterministic multi-environment generators (`npm run generate`):
  - **CSS (`dist/css/`)**: Per-scheme custom properties (`--tol-<scheme>-*`) and unified `tol.css` bundle.
  - **JavaScript / TypeScript (`dist/js/`, `dist/json/`)**: Tree-shakeable ESM module (`index.js` + `index.d.ts`) with `interpolate`, `discreteRainbow`, `discreteColors`, and `sample` helpers.
  - **Python (`dist/py/tol_palettes.py`)**: Standalone Python module compatible with `matplotlib` colormaps (`tol_cset`, `tol_cmap`).
  - **Game Engines & Pixel Art (`dist/godot/`, `dist/gpl/`, `dist/aseprite/`)**: Godot 4.x `ColorPalette` `.tres` resources, `tol_palettes.gd` constants script, and GIMP/Aseprite `.gpl` palettes.
  - **Offline Reference Gallery (`dist/gallery/index.html`)**: Interactive swatch explorer with WCAG contrast ratios and keyboard navigation.
- Automated linter (`tools/lint.mjs`) and packaging regression test suite (`tests/package.test.mjs`).
- Full BSD-3-Clause `LICENSE` and third-party attribution `NOTICE`.
