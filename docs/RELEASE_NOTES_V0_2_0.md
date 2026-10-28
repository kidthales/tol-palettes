# Release Notes — `@kidthales/tol-palettes` v0.2.0 (Pre-release)

Multi-ecosystem distribution release expanding `@kidthales/tol-palettes` from source datasets into turnkey packages across npm, GitHub Packages, PyPI, Godot 4.x, and an interactive GitHub Pages documentation site with WCAG-audited contrast enhancements.

> [!NOTE]
> **SemVer 2.0.0 Pre-release**: In accordance with SemVer 2.0.0 §4, versions in the `0.y.z` range represent initial development releases with evolving APIs. True stable major releases commence at `v1.0.0`.

## Highlights

### Multi-Ecosystem Distribution & Packaging
- **npm Public Registry & GitHub Packages**:
  - Published `@kidthales/tol-palettes` to the npm public registry with public access and dual-publishing support for GitHub Packages.
  - Zero-config consumer installation via `npm install @kidthales/tol-palettes`.
  - Pinned CDN usage via jsDelivr and unpkg (`@kidthales/tol-palettes@0.2.0/dist/css/tol.css`).
- **Python Package Index (PyPI)**:
  - First-class Python distribution as `tol-palettes` on PyPI built with Hatchling.
  - Configured OIDC GitHub Actions Trusted Publishing (`id-token: write`) for passwordless, tokenless provenance.
  - Optional `matplotlib` integration (`pip install "tol-palettes[matplotlib]"`).
- **Godot 4.x Addon & Release Assets**:
  - Turnkey Godot 4.x addon in `dist/godot/addons/tol_palettes/` with `plugin.cfg` registering version `0.2.0`.
  - Automated bundling of release zips (`tol-palettes-godot-v0.2.0.zip`, `tol-palettes-gpl-v0.2.0.zip`, `tol-palettes-aseprite-v0.2.0.zip`, and `tol-palettes-json-v0.2.0.zip`) attached to GitHub Releases.

### GitHub Pages & Documentation Suite
- **Custom Domain Deployment**:
  - Deployed documentation and interactive swatch gallery to [tol-palettes.kidthales.com](https://tol-palettes.kidthales.com) via GitHub Actions Pages workflow with `cname: tol-palettes.kidthales.com`.
  - Integrated full offline and online gallery browsing with WCAG contrast audits and keyboard navigation.
- **Reference & Guide Documentation**:
  - Comprehensive per-ecosystem guides: CSS (`docs/css.md`), JavaScript/TypeScript (`docs/js.md`), Python (`docs/python.md`), Godot (`docs/godot.md`), and GIMP/Aseprite (`docs/gpl-aseprite.md`).
  - Strict scope and governance policies documented in `README.md`, `CITATION.cff`, and `NOTICE`.

### Swatch Gallery Contrast & Accessibility Hardening
- **WCAG Contrast Ratios**:
  - Fixed color masking and contrast compliance across interactive gallery preview buttons and swatch cards.
  - Hardened canvas preview elements to maintain $\ge 4.5:1$ contrast against light and dark theme surfaces.

### Local CI & Developer Tooling
- **Local Multi-Gate CI Runner**:
  - Introduced `scripts/ci-local.ps1` automating all 4 local quality gates (linting, schema validation, test runner, build artifact checks).
  - Enforced strict deterministic generation checks (`npm run generate`) to guard against uncommitted generator drift.

## Installation

### JavaScript / TypeScript (npm)

```bash
npm install @kidthales/tol-palettes
```

### Python (PyPI)

```bash
pip install tol-palettes

# With optional matplotlib colormap support
pip install "tol-palettes[matplotlib]"
```

### Godot 4.x Addon

Download `tol-palettes-godot-v0.2.0.zip` from the [GitHub Releases](https://github.com/kidthales/tol-palettes/releases) page and extract `addons/tol_palettes` into your Godot project root.

### CDN

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@0.2.0/dist/css/tol.css">
```

## Attribution & Acknowledgements

Colour scheme values are sourced from Dr. Paul Tol's SRON technical notes (*"Colour Schemes"*, SRON/EPS/TN/09-002) and `tol_colors.py` (version 2022.10, Copyright (c) 2022, Paul Tol, 3-Clause BSD). See `NOTICE` for full attribution.
