# Source-only archival

Verified on 2026-11-03 against source `7164a0a269cc77944ecfbed4eeb54bacba5162f0` with Node 22.23.3; npm 10.9.9.
The repository and its dependency pins are the rebuild archive; no generated app or deployment bundle is needed as an extra input. Preserve Git history.

## Restore and verify

Clone this repository, check out the desired revision and run:

```sh
npm ci
npm run build
```

Normal build/check passed (receipt `vvibe-build`, exit 0, log SHA-256 `2accfc200dcb6aadb0bd8e0f3901ae20ccf0a2dcf00259f204459975c2783bfd`). This is a rebuild check, not a new runtime acceptance or deployment.


After verification remove regenerated dependency environments, caches and build output again. Keep authored source, assets, dependency pins and Git metadata.
