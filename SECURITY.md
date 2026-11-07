# Security Policy

## Reporting

Do not open a public issue for authentication bypass, token replay, origin bypass, honeypot
leakage, denial of service, or privacy defects.

Report security issues privately to the repository maintainers through GitHub Security
Advisories:

<https://github.com/OxygenAILab/OxygenChallenge/security/advisories/new>

Include the affected version, reproduction steps, expected impact, and whether production data
or challenge tokens were exposed.

## Scope

Relevant reports include:

- Challenge answer disclosure through DOM, JSON, SVG text, cache, or logs.
- `siteverify` signature, replay, action, site, or expiry bypass.
- Origin allow-list bypass for `/v1/challenges` or `/embed`.
- Cross-site scripting in the challenge widget.
- Secret leakage in the repository or build artifacts.
- Unbounded memory growth or rate-limit bypass.

The following are known limitations, not vulnerabilities by themselves:

- Vision models can solve screenshot-based challenges.
- Automated browsers can synthesize keyboard and pointer events.
- Calculation challenges are easy for computers.
- The current in-memory store is not suitable for multi-instance deployment.
- Camera and microphone challenges require explicit user permission and have dedicated
  accessibility fallbacks.

## Supported Versions

Security fixes are applied to the latest release line. `v26.0-alpha.*` releases are pre-release
software and should be evaluated before production use.
