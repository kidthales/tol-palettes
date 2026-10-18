# Release Notes — `@kidthales/tol-palettes` v0.1.0 (Pre-release)

Initial public open-source pre-release of `@kidthales/tol-palettes`.

> [!NOTE]
> **SemVer 2.0.0 Pre-release**: In accordance with SemVer 2.0.0 §4, versions in the `0.y.z` range represent initial development releases with evolving APIs. True stable major releases commence at `v1.0.0`.

## Highlights

- **22 Canonical Paul Tol Colour Schemes**: High-fidelity, hand-verified colour data across qualitative, diverging, sequential, and special schemes extracted directly from Paul Tol's Notes and `tol_colors.py` (2022.10).
- **Multi-Environment Generators & Parity**:
  - **CSS Custom Properties**: Per-scheme stylesheets and a complete bundle (`dist/css/tol.css`).
  - **JavaScript / TypeScript**: Tree-shakeable ESM module (`dist/js/`) with full TypeScript declarations (`index.d.ts`), color interpolation, and discrete rainbow helpers.
  - **Python**: Standalone pure-Python module (`dist/py/tol_palettes.py`) with optional `matplotlib` colormap integration.
  - **Game & Pixel Art**: Godot 4.x `ColorPalette` `.tres` resources and `TolPalettes` GDScript 2.0 class (`dist/godot/tol_palettes.gd`), plus GIMP/Aseprite `.gpl` palettes (`dist/gpl/`, `dist/aseprite/`).
  - **Offline Reference Gallery**: Self-contained, zero-dependency HTML reference gallery (`dist/gallery/index.html`) featuring WCAG 2.x contrast ratios and accessible swatch hex copy buttons with visual feedback.
- **Strict Data Integrity & Hygiene**:
  - Zero invented names: Qualitative colors retain official names; all other schemes strictly use canonical uppercase `#RRGGBB` hex values.
  - 100% attribution headers and 3-Clause BSD licence notice.
  - Distribution tarball whitelisted to prevent any bytecode leakage.
- **GitHub Packages Distribution**: Published to GitHub Packages (`npm.pkg.github.com`) under the `@kidthales` scope.

## Installation

Add the `@kidthales` registry to your project `.npmrc`:

```ini
@kidthales:registry=https://npm.pkg.github.com
```

Install via npm:

```bash
npm install @kidthales/tol-palettes
```

## Attribution & Acknowledgements

Colour scheme values are sourced from Dr. Paul Tol's SRON technical notes (*"Colour Schemes"*, SRON/EPS/TN/09-002) and `tol_colors.py` (version 2022.10, Copyright (c) 2022, Paul Tol, 3-Clause BSD). See `NOTICE` for full attribution.
