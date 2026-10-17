# Contributing to `@kidthales/tol-palettes`

Thank you for your interest in contributing to `@kidthales/tol-palettes`!

## Core Invariants

1. **Values Only, With Attribution**: We store only verified hex colour values and structural lookup rules in `data/schemes/*.json`. Never copy prose, figures, or templates from upstream publications.
2. **Zero Invented Names**: Colour names are included *only* when provided by the official `tol_colors.py` module.
3. **Deterministic Generation**: Never hand-edit files under `dist/`. Modify the generator scripts in `tools/` and run `npm run generate`.

## Development Workflow

1. Requires **Node.js >= 22** (and Python 3 for Python generator verification).
2. Install dependencies:
   ```bash
   npm ci
   ```
3. Regenerate distribution outputs after modifying any generator:
   ```bash
   npm run generate
   ```
4. Run the full linter, schema validator, and test suite before submitting a Pull Request:
   ```bash
   npm test
   ```
