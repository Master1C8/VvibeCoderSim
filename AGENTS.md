# VvibeCoderSim agent map

Keep context narrow: run `rg` first and open only the module named below. Do not read all engine files for a local change.

- Ordinary decision text/effects: `lib/engine/card-catalog.ts`
- Recovery/deployment decisions and choice application: `lib/engine/decision.ts`
- Decision types/copy/deterministic selection: `lib/engine/decision-{types,copy,random}.ts`
- Progress and simulated work events: `lib/engine/simulation.ts`
- Token pricing/limits: `lib/engine/usage.ts`
- Token mutations/migration: `lib/engine/token-ledger.ts`
- Resources, extremes and successors: `lib/engine/resources.ts`
- Game state/persistence helpers: `lib/game/session.ts`
- Page orchestration only: `app/page.tsx`
- Chat rendering: `components/ChatPanel.tsx`
- Header/resources/effect badges: `components/GameHeader.tsx`, `components/ResourceDashboard.tsx`, `components/ChoiceEffects.tsx`
- Architecture details and invariants: `docs/ARCHITECTURE.md`, `docs/SIMULATION.md`

The old personality arc, dialogue engine and personality fragment catalogs were removed intentionally. Do not restore them.

Production uses only the generic `deploy/Caddyfile.vvibecoder` template. Keep real hostnames, addresses, credentials, and server-wide proxy configuration outside this repository.

Verify changes with `npm run lint`, `./node_modules/.bin/tsc --noEmit --incremental false`, `npm test`, and `npm run build`.
