# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2.0 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in `@kidthales/tol-palettes`, please report it privately via [GitHub Private Vulnerability Reporting](https://github.com/kidthales/tol-palettes/security/advisories/new) rather than opening a public issue or pull request.

If GitHub Private Vulnerability Reporting is unavailable or unreachable, security reports may be emailed directly to `admin@agogpixel.com` with the subject `[SECURITY] tol-palettes vulnerability report`.

### Coordinated Vulnerability Disclosure (CVD) SLAs

We adhere to standard Coordinated Vulnerability Disclosure (CVD) practices with the following response commitments:

- **Initial Acknowledgment**: Within 48 hours of report receipt.
- **Triage & Severity Assessment**: Within 5 business days, including preliminary impact evaluation and remediation planning.
- **Remediation & Patch Target**: Within 30 calendar days for High/Critical severity issues; within 60 calendar days for Medium/Low severity issues.
- **Public Disclosure**: Coordinated security advisory published alongside the patch release on GitHub Security Advisories.

### Security Scope

The following components are strictly in scope for security reviews:
- Build automation and code generators (`tools/*.mjs`, `scripts/ci-local.ps1`).
- Supply-chain artifacts, subresource integrity metadata, and distribution archives (`dist/sri.json`, `dist/manifest.json`, `dist/SHA256SUMS.txt`, zip archives).
- GitHub Actions CI/CD workflows (`.github/workflows/*.yml`), action commit SHA pinning, and least-privilege token permissions.
- Static documentation gallery Content Security Policy (strict `script-src 'self'`), inline script elimination, and single-quote HTML escaping.

## Verifying Release Artifacts & Supply-Chain Integrity

Every release publishes cryptographic hashes, subresource integrity metadata, and GitHub Actions build provenance attestations. Consumers should verify downloaded artifacts using the following procedures:

### 1. SHA-256 Checksums

Download the release asset archive and `SHA256SUMS.txt` from the GitHub Release, then verify file integrity:

```bash
sha256sum -c SHA256SUMS.txt
```

### 2. GitHub Actions Build Provenance Attestation

Official release assets are signed with GitHub Actions OIDC build provenance attestations. Verify the authenticity of any downloaded asset with the GitHub CLI:

```bash
# Verify provenance of Godot addon bundle
gh attestation verify tol-palettes-godot.zip --owner kidthales

# Verify provenance of SHA256SUMS manifest
gh attestation verify SHA256SUMS.txt --owner kidthales
```

### 3. npm Registry Package Signatures

When installing from npm, verify signatures published via Sigstore:

```bash
npm audit signatures
```

### 4. Web Subresource Integrity (SRI)

For web assets loaded from CDNs (e.g. jsDelivr, unpkg), look up the precomputed `sha384` digest in `dist/sri.json` and apply the `integrity` attribute:

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/npm/@kidthales/tol-palettes@0.2.0/dist/css/tol.css"
  integrity="sha384-..."
  crossorigin="anonymous"
/>
```
