# Release Notes — `@kidthales/tol-palettes` v0.3.0 (Pre-release)

Security, supply-chain, and release engineering milestone achieving clean-room supply chain hardening, subresource integrity manifests, SLSA build provenance attestations, bundle size budgets, AST workflow security auditing, and parity with `picotol v0.5.1`.

> [!NOTE]
> **SemVer 2.0.0 Pre-release**: In accordance with SemVer 2.0.0 §4, versions in the `0.y.z` range represent initial development releases with evolving APIs. True stable major releases commence at `v1.0.0`.

## Highlights

### Clean-Room Supply Chain & Cryptographic Integrity
- **Deterministic Release Packaging**:
  - Replaced ad-hoc archiving with a deterministic zip packager (`tools/zip-util.mjs` and `tools/package-assets.mjs`) supporting fixed modified timestamps (`DEFAULT_ZIP_MTIME` or `SOURCE_DATE_EPOCH`), reproducible entry ordering, and normalized permissions.
  - Generates downloadable zip bundles for Godot 4.x (`tol-palettes-godot.zip`), Aseprite (`tol-palettes-aseprite.zip`), and GIMP/Inkscape/Krita (`tol-palettes-gpl.zip`).
- **Path Jail Sandbox Enforcement**:
  - Introduced `tools/path-jail.mjs` enforcing boundary jails (`assertSafeWriteTarget`) to prevent path traversal or accidental writes outside designated distribution directories.
- **Subresource Integrity & Cryptographic Manifests**:
  - Automated generation of `dist/sri.json` and `dist/sri.d.ts` publishing SHA-384 digests and byte/gzip sizes for CDN stylesheets, ESM modules, and JSON data.
  - Automated generation of `dist/manifest.json` and `dist/SHA256SUMS.txt` covering all released distribution files.
  - New `./sri` and `./schemes.json` subpath exports registered in `package.json` with dedicated TypeScript declaration typings.
- **SLSA Build Provenance**:
  - Release pipeline automatically signs and publishes GitHub Actions OIDC build provenance attestations on all release assets using `actions/attest-build-provenance`.

### Workflow Security & Static AST Auditing
- **YAML AST Workflow Security Auditor**:
  - Implemented `tools/check-workflows.mjs` (`npm run check:workflows`) using `yaml` AST parsing to enforce strict GitHub Actions architectural contracts.
  - Enforces explicit top-level and job-level permissions, 40-character commit SHA pinning on third-party actions, `persist-credentials: false` on checkouts, timeout boundaries ($\le 30$ minutes), and rejection of unescaped expression injections in run steps.
- **Remote Security Scanning Matrix**:
  - Dedicated security scanning job in `.github/workflows/ci.yml` running `gitleaks` secret audit and `zizmor` v1.31.1 static analysis.
  - Matrix testing expanded to 4-leg cross-platform verification across Node.js (22, 24) and Python (3.12, 3.13) on Ubuntu, Windows, and macOS runners.
- **Release Tag Guard**:
  - Fail-closed tag-guard job in `.github/workflows/release.yml` verifying exact version parity across `package.json`, `pyproject.toml`, `CITATION.cff`, and `dist/godot/addons/tol_palettes/plugin.cfg` prior to executing release steps.

### Bundle Size Budgets & Developer Verification
- **Automated Bundle Size Budgets**:
  - Introduced `tools/check-budgets.mjs` (`npm run check:budgets`) enforcing raw, gzip (level 9), and brotli (quality 11) byte ceilings across CSS, JS, JSON, Python, and gallery outputs.
- **Dual-tsconfig Type Checking**:
  - Integrated `npm run check:types` validating consumer imports across both TypeScript `bundler` and `node16` module resolution strategies.
- **Real Matplotlib Testing**:
  - Expanded Python test suite (`tests/py.test.mjs`) to test colormaps (`tol_cmap`, `discretemap`) against installed `matplotlib` across all 22 schemes with RGBA stop sampling and bad color validation.
- **Local Multi-Gate CI Runner**:
  - Upgraded `scripts/ci-local.ps1` to a 5-gate runner generating cryptographic execution receipts (`.ci-local/receipt.json`).

## Installation & CDN Reference

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

### CDN with Subresource Integrity (SRI)

```html
<!-- Full 22-scheme stylesheet with SRI check -->
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@0.3.0/dist/css/tol.css"
  integrity="sha384-..."
  crossorigin="anonymous"
/>
```
