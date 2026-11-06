# Release Notes — `@kidthales/tol-palettes` v0.3.1 (Pre-release)

Maintenance and security patch pre-release delivering copy and attribution tone-down adjustments across runtime diagnostics, metadata, Godot GDScript helpers, JS ESM module documentation, and gallery templates (#76), alongside a dependency security bump for `fast-uri` (#74).

> [!NOTE]
> **SemVer 2.0.0 Pre-release**: In accordance with SemVer 2.0.0 §4, versions in the `0.y.z` range represent initial development releases with evolving APIs. True stable major releases commence at `v1.0.0`.

## Highlights

### Attribution & Copy Tone-Down Harmonization (#76)
- **Runtime Diagnostics & Warning Tone**: Toned down repetitive personal name references across runtime error and warning messages, keeping diagnostic feedback objective and concise.
- **GDScript Constants & Helpers**: Streamlined attribution and commentary in `dist/godot/addons/tol_palettes/tol_palettes.gd` and associated plugin metadata (`plugin.cfg`), attributing underlying color data directly to Paul Tol's SRON technical note while minimizing author commentary noise.
- **JavaScript / TypeScript ESM Module**: Cleaned up docstrings and inline JSDoc comments in `dist/js/index.js` and `dist/js/index.d.ts` for clean IDE autocompletion.
- **Documentation & Swatch Gallery**: Polished visual header templates and subtext in `dist/gallery/index.html` and markdown guides for cleaner readability.

### Dependency Security Maintenance (#74)
- **`fast-uri` Security Bump**: Updated `fast-uri` dependency from `3.1.8` to `3.1.9` in dependency trees, proactively remediating security advisories and ensuring upstream URI parsing integrity.

### Distribution Artifacts & Cryptographic Manifests
- **Rebuilt Distribution Bundles**: Re-executed deterministic packaging (`npm run generate`) to produce updated distribution archives in `dist/assets/` (`tol-palettes-godot.zip`, `tol-palettes-aseprite.zip`, `tol-palettes-gpl.zip`).
- **Recalculated Cryptographic Hashes**: Generated fresh `0.3.1` digests across `dist/manifest.json`, `dist/sri.json`, `dist/sri.d.ts`, and `dist/SHA256SUMS.txt`.
- **Godot Addon Version Sync**: Synchronized `dist/godot/addons/tol_palettes/plugin.cfg` to register `version="0.3.1"`.

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
  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@0.3.1/dist/css/tol.css"
  integrity="sha384-..."
  crossorigin="anonymous"
/>
```
