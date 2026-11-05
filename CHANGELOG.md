# Changelog

All notable changes to `@kidthales/tol-palettes` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-05

For the full narrative release notes, see [`docs/RELEASE_NOTES_V0_3_0.md`](docs/RELEASE_NOTES_V0_3_0.md).

### Added
- **Clean-Room Supply Chain & Cryptographic Integrity**:
  - Deterministic release asset packaging (`tools/package-assets.mjs` and `tools/zip-util.mjs`) generating reproducible zip archives (`tol-palettes-godot.zip`, `tol-palettes-aseprite.zip`, `tol-palettes-gpl.zip`) with fixed timestamps and normalized file permissions.
  - Path jail utility (`tools/path-jail.mjs`) confining in-repo asset generation strictly within designated `dist/` distribution boundaries.
  - Automated generation of cryptographic release manifests (`dist/manifest.json`, `dist/sri.json`, `dist/sri.d.ts`, and `dist/SHA256SUMS.txt`).
  - Added `./sri` and `./schemes.json` export subpaths in `package.json` with dedicated TypeScript definitions (`dist/sri.d.ts`, `dist/json/schemes.d.ts`).
  - GitHub Actions SLSA build provenance attestations on all release assets via `actions/attest-build-provenance`.
- **Workflow Security & Static AST Auditing**:
  - YAML AST workflow security auditor (`tools/check-workflows.mjs`) enforcing structural permissions, 40-character commit SHA pinning, checkout credential isolation (`persist-credentials: false`), timeout limits, and rejecting unescaped expression injections in run scripts.
  - Remote CI security scanning job with `gitleaks` secret audit and `zizmor` GitHub Actions static analysis pinned to v1.31.1.
  - 4-leg verification matrix across Node [22, 24] and Python [3.12, 3.13] across Ubuntu, Windows, and macOS runners.
  - Fail-closed tag-guard job in `.github/workflows/release.yml` verifying exact version alignment across `package.json`, `pyproject.toml`, `CITATION.cff`, and `plugin.cfg` before triggering release jobs.
- **Bundle Budgets & Quality Gates**:
  - Automated bundle size budget verification (`tools/check-budgets.mjs` via `npm run check:budgets`) tracking raw, gzip (level 9), and brotli (quality 11) sizes across all distributable bundles against hard limits.
  - Dual `tsconfig` verification gate (`check:types`) validating exports across both `bundler` and `node16` module resolution strategies.
  - Real `matplotlib` colormap testing in `tests/py.test.mjs` verifying RGBA stop sampling, bad color fallbacks, and boundary conditions.
  - Swatch gallery Content Security Policy hardening (`base-uri 'none'`, `form-action 'none'`, `script-src 'self'`).

### Changed
- Bumped project version to `0.3.0` across `package.json`, `package-lock.json`, and `pyproject.toml`.
- Updated `dist/godot/addons/tol_palettes/plugin.cfg` to register `version="0.3.0"`.
- Pinned CDN references in `docs/css.md`, `SECURITY.md`, and `CONTRIBUTING.md` to `0.3.0`.
- Updated `SECURITY.md` supported versions table to include `0.3.x`.
- Updated `CITATION.cff` release version to `0.3.0` and release date to `2026-11-05`.
- Upgraded `scripts/ci-local.ps1` to a 5-gate local CI runner generating cryptographic CI receipts (`.ci-local/receipt.json`).

## [0.2.0] - 2026-10-28

For the full narrative release notes, see [`docs/RELEASE_NOTES_V0_2_0.md`](docs/RELEASE_NOTES_V0_2_0.md).

### Added
- **Multi-Ecosystem Distribution & Packaging**:
  - Published to npm public registry (`@kidthales/tol-palettes`) with dual-publishing support for GitHub Packages.
  - Python distribution (`tol-palettes`) on PyPI via Hatchling and GitHub Actions OIDC Trusted Publishing (`id-token: write`).
  - Turnkey Godot 4.x addon in `dist/godot/addons/tol_palettes/` with `plugin.cfg` registering version `0.2.0`.
  - Automated release assets bundling (`tol-palettes-godot-v0.2.0.zip`, `tol-palettes-gpl-v0.2.0.zip`, `tol-palettes-aseprite-v0.2.0.zip`, and `tol-palettes-json-v0.2.0.zip`).
- **GitHub Pages & Documentation**:
  - Live documentation and swatch gallery deployed to [tol-palettes.kidthales.com](https://tol-palettes.kidthales.com) via GitHub Actions Pages workflow.
  - Ecosystem documentation guides in `docs/` (CSS, JS/TS, Python, Godot, GPL/Aseprite).
  - Open source governance files: `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, and issue/PR templates.
- **Local CI & Developer Tooling**:
  - Introduced `scripts/ci-local.ps1` automating all 4 local quality gates (linting, schema validation, test runner, build artifact checks).

### Changed
- Bumped project version to `0.2.0` across `package.json`, `package-lock.json`, and `pyproject.toml`.
- Pinned CDN references in `docs/css.md` to `0.2.0`.
- Added npm and PyPI version badges to `README.md`.

### Fixed
- Fixed gallery color masking and contrast compliance across interactive preview buttons and swatch elements.

### Errata
- Corrected Godot GDScript usage example in `docs/game.md` (`TolPalettes.MUTED_RED` -> `TolPalettes.MUTED_ROSE`) to align with canonical colour naming in `tol_colors.py`.
- Hardened static reference gallery for strict `Content-Security-Policy: script-src 'self'` by extracting inline script into external `dist/gallery/gallery.js`.
- Synchronized release asset bundle paths in `.github/workflows/release.yml` with generated distribution archives (`dist/assets/tol-palettes-{godot,aseprite,gpl}.zip`).

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
