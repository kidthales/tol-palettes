# Contributing to `@kidthales/tol-palettes`

Thank you for your interest in contributing to `@kidthales/tol-palettes`!

## Code of Conduct

Participation in this project is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you agree to uphold its standards. Violations may be reported to `admin@agogpixel.com`.

## Security & Vulnerability Reporting

Security disclosures must follow our Coordinated Vulnerability Disclosure (CVD) process outlined in [`SECURITY.md`](SECURITY.md). Please report vulnerabilities privately via [GitHub Security Advisories](https://github.com/kidthales/tol-palettes/security/advisories/new) rather than public issues. If PVR is unreachable, contact `admin@agogpixel.com`.

## Developer Certificate of Origin (DCO)

All contributions to this project must certify adherence to the Developer Certificate of Origin (DCO) version 1.1:

```text
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

To certify adherence to the DCO, add a `Signed-off-by: Your Name <your.email@example.com>` trailer to your git commit messages (`git commit -s`).

## Core Invariants

1. **Values Only, With Attribution**: We store only verified hex colour values and structural lookup rules in `data/schemes/*.json`. Never copy prose, figures, or templates from upstream publications. See [`NOTICE`](NOTICE).
2. **Zero Invented Names**: Colour names are included *only* when provided by the official `tol_colors.py` module.
3. **Deterministic Generation**: Never hand-edit files under `dist/`. Modify generator scripts in `tools/` and run `npm run generate`.
4. **Single Source of Truth**: `data/schemes/*.json` is the sole canonical data layer. Target formats (CSS, JS/TS, Python, Godot, GPL, Aseprite, Gallery) derive deterministically.

## Development Workflow & Prerequisites

- **Node.js**: >= 22.2.0
- **Python**: >= 3.12 (with `build`, `hatchling`, and `matplotlib` installed for verification)
- **PowerShell**: pwsh 7+ (for local CI runner `scripts/ci-local.ps1`)

### Setup

```bash
npm ci
```

### Generation & Local Builds

Regenerate distribution outputs after modifying any data scheme or generator in `tools/`:

```bash
npm run generate          # Regenerates all dist outputs (CSS, JS, Python, Game, Assets, Gallery)
npm run package:assets    # Builds release zip archives (Godot, Aseprite, GPL) and manifests in dist/
```

### Quality Assurance & Testing

Run all linters, type checks, schema validations, budgets, and cross-language tests before submitting a PR:

```bash
npm run check:types    # Runs dual-tsconfig tsc --noEmit (bundler & node16)
npm run check:budgets  # Enforces raw, gzip (level 9), and brotli (quality 11) bundle size ceilings
npm run lint           # Executes check:types and tools/lint.mjs
npm run validate       # Validates all 22 scheme JSON files against JSON Schema
npm test               # Runs lint, check:budgets, and full node test suite
```

For full 1:1 parity with GitHub Actions CI, run the local runner:

```pwsh
pwsh ./scripts/ci-local.ps1
```

## Verifying Supply-Chain Integrity & Releases

Release packages and standalone assets provide cryptographically verifiable checksums and attestations:

```bash
# 1. Verify SHA-256 release sums
sha256sum -c SHA256SUMS.txt

# 2. Verify GitHub Actions build provenance attestations
gh attestation verify tol-palettes-godot.zip --owner kidthales

# 3. Verify npm package signatures
npm audit signatures
```

For web consumers, subresource integrity (SRI) hashes are published in `dist/sri.json`:

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@0.3.1/dist/css/tol.css"
  integrity="sha384-3g0jAZKNIK2KxgHMBn+Qo9PTuGPS6fX4yKZFuIzuy3MEAzYQmiuGIB4EUFNkZaMb"
  crossorigin="anonymous"
/>
```

## Pull Request Guidelines

1. **Atomic, Conventional Commits**: Use conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`, `test:`) with DCO sign-offs (`-s`).
2. **Deterministic Artifacts**: If changing schemes or generators, ensure `npm run generate` and `npm run package:assets` have been executed and generated files committed.
3. **Green Local CI**: Ensure `pwsh ./scripts/ci-local.ps1` passes with zero errors before submitting or requesting review.
4. **Issue Linkage**: Sub-issues must link their parent Epic in the PR description (`Parent: #<epic-id>`).
