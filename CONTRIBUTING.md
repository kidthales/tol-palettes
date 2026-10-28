# Contributing to `@kidthales/tol-palettes`

Thank you for your interest in contributing to `@kidthales/tol-palettes`!

## Code of Conduct

Participation in this project is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you agree to uphold its standards. Violations may be reported to `admin@agogpixel.com`.

## Core Invariants

1. **Values Only, With Attribution**: We store only verified hex colour values and structural lookup rules in `data/schemes/*.json`. Never copy prose, figures, or templates from upstream publications. See [`NOTICE`](NOTICE).
2. **Zero Invented Names**: Colour names are included *only* when provided by the official `tol_colors.py` module.
3. **Deterministic Generation**: Never hand-edit files under `dist/`. Modify the generator scripts in `tools/` and run `npm run generate`.
4. **Single Source of Truth**: `data/schemes/*.json` is the sole canonical data layer. All target formats (CSS, JS/TS, Python, Godot, GPL, Aseprite, Gallery) are derived deterministically.

## Development Workflow & Prerequisites

- **Node.js**: >= 22.0.0
- **Python**: >= 3.10 (for Python generator verification and tests)
- **PowerShell**: pwsh 7+ (optional, for local CI runner `scripts/ci-local.ps1`)

### Setup

```bash
npm ci
```

### Generation & Local Builds

Regenerate distribution outputs after modifying any data scheme or generator in `tools/`:

```bash
npm run generate          # Regenerates all dist outputs (CSS, JS, Python, Game, Gallery)
npm run package:assets    # Builds release zip archives (Godot, Aseprite, GPL) in dist/assets/
```

### Quality Assurance & Testing

Run all linters, schema checks, and cross-language tests before submitting a PR:

```bash
npm run lint       # Validates schemas, JS syntax, attribution headers, and export resolution
npm run validate   # Validates all 22 scheme JSON files against JSON schema and invariants
npm test           # Executes the full cross-environment test suite (Node, Python, Game, Gallery)
```

For full 1:1 parity with GitHub Actions CI, run the local runner:

```pwsh
pwsh ./scripts/ci-local.ps1
```

## Pull Request Guidelines

1. **Atomic, Conventional Commits**: Use conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
2. **Deterministic Artifacts**: If changing schemes or generators, ensure `npm run generate` and `npm run package:assets` have been executed and generated files committed.
3. **Green Local CI**: Ensure `pwsh ./scripts/ci-local.ps1` passes with zero errors before submitting or requesting review.
4. **Issue Linkage**: Sub-issues should link their parent Epic or issue in the PR description.
