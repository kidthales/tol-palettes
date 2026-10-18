# Release Notes — `@kidthales/tol-palettes` v0.1.1 (Pre-release)

Maintenance and documentation pre-release confirming 100% tripartite alignment between live web notes, Python reference module, and historical technical note PDF.

> [!NOTE]
> **SemVer 2.0.0 Pre-release**: In accordance with SemVer 2.0.0 §4, versions in the `0.y.z` range represent initial development releases with evolving APIs. True stable major releases commence at `v1.0.0`.

## Highlights

- **Complete 3-Way Crosscheck Audit**:
  - Closed the historical comparison gap in `docs/crosscheck-report.md` by verifying all 22 schemes against `colourschemes.pdf` (SRON/EPS/TN/09-002 Issue 3.2, 18 August 2021).
  - Formalized the authority hierarchy establishing the live website (`https://sronpersonalpages.nl/~pault/`) as the authoritative superset containing post-2021 additions (`nightfall`, `incandescent`, `banded-12/16/20`).
  - Documented the rationale for the modern 11-color `dark` scheme (WCAG contrast $\ge 4.5:1$ against white for low-vision legibility) and 7-color `pale` scheme (1:1 hue pairing with `bright`).
- **Extraction Tooling Enhancement**:
  - Updated `tools/extract.mjs` to automatically generate the 3-way comparison matrix (Web, Python module, and PDF).
- **Metadata Refresh & Deterministic Regeneration**:
  - Refreshed retrieval provenance timestamp (`retrieved: 2026-10-18`) across all 22 canonical JSON files (`data/schemes/*.json`).
  - Regenerated all distribution targets (`dist/css/`, `dist/js/`, `dist/json/`, `dist/py/`, `dist/godot/`, `dist/gpl/`, `dist/aseprite/`, and `dist/gallery/`).

## Installation

Add the `@kidthales` registry to your project `.npmrc`:

```ini
@kidthales:registry=https://npm.pkg.github.com
```

Install via npm:

```bash
npm install @kidthales/tol-palettes@0.1.1
```

## Attribution & Acknowledgements

Colour scheme values are sourced from Dr. Paul Tol's SRON technical notes (*"Colour Schemes"*, SRON/EPS/TN/09-002) and `tol_colors.py` (version 2022.10, Copyright (c) 2022, Paul Tol, 3-Clause BSD). See `NOTICE` for full attribution.
