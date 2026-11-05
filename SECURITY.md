# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2.0 | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in `@kidthales/tol-palettes`, please report it privately via [GitHub Private Vulnerability Reporting](https://github.com/kidthales/tol-palettes/security/advisories/new) rather than opening a public issue or pull request.

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
