# VvibeCoder Sim

An interactive vibe-coding simulator with Reigns-style resource management. Describe a project, watch an AI model simulate development work, and periodically choose one of three decisions. Keep the programmer between six dangerous extremes and guide the project to a successful production deployment.

> Every file, command, error, and deployment is a simulated event. The app does not modify a real project, call an AI API, or request real secrets.

## Game loop

1. Describe a project and start Codex. Claude Code, Gemini, and Grok appear in the selector but are unavailable.
2. The model simulates work on a codebase and advances the project.
3. The chat presents three decisions.
4. Each decision changes one to three programmer resources: Money, Motivation, and Team. The standard pool contains 36 hand-authored comic choices about outside help, management, and dubious technical shortcuts.
5. Reaching `30` or `70` ends the current programmer's career. The chat is replaced by one of six detailed absurd departure stories matching the boundary reached.
6. A successor appears only after selecting **Hire the next vibe coder**. They start at `50/50/50`, inherit the code, and lose 4% progress during handoff.
7. The deploy button beside the project name shows the current success chance. It unlocks at 95% progress and opens a separate set of production deployment choices.
8. Deployment starts with a 10% success chance. Each full point of progress from 95% through 99% adds 3 percentage points, and each previous failed deployment adds another 5. Failure creates an incident and a recovery decision.
9. A successful deployment opens a result screen listing every vibe coder, token usage, and a Telegram sharing action.

Each programmer receives a random nickname from a pool of 28 names. Repeated names use Roman numerals, such as `Button Masher II` and `Button Masher III`.

Model context is tracked separately. Every paid call includes the current working context, chat history, and the selected command cost. Above 60% context usage, errors become more likely and commands become more expensive. Context may exceed 100%; changing programmers resets it while preserving the project's total token usage and game history.

The weekly token limit resets at midnight on Sunday. When it runs out, four options remain: pay Codex 5 Money for 20%, pay 10 Money for 100%, receive one third of the base allowance from free models at the cost of 7% progress and worse resources, or try coding manually. Manual coding always ends the current programmer's career with a dedicated **Manual Mode** ending.

## Three resources

| Resource | Low extreme | Neutral | High extreme |
| --- | --- | --- | --- |
| Money | Poverty, ≤30 | 50 | Wealth, ≥70 |
| Motivation | Apathy, ≤30 | 50 | Mania, ≥70 |
| Team | Outcast, ≤30 | 50 | Leader, ≥70 |

Both extremes are equally dangerous. Roughly one in twelve standard decision screens includes a rare option that changes the future deployment chance. Improvements tend to cost substantial Money; cheap shortcuts provide immediate benefits but reduce the chance.

## Interface

- Model chat with simulated `Searched`, `Read`, `Modified`, `Created`, `Ran`, and `Fixed` operations.
- Auto-scroll only while the reader remains near the bottom.
- Project progress and accumulated token usage.
- Decisions shown as ordinary chat buttons; there are no swipe cards.
- Three resource bars without numeric values.
- Qualitative effects shown as `+`, `++`, `−`, `−−`, or a hidden gray `?`.
- Per-programmer tokens, context usage, weekly limit, and paid replenishment.
- Recovery of one active game from `localStorage`.
- Opt-in anonymous first-party usage statistics at `/stats`, with per-browser consent and deletion.
- An optional public leaderboard; results are submitted only after a separate confirmation.

## Quick start

Requirements: Node.js 20.9+ and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production mode:

```bash
npm run build
npm start
```

## Verification

```bash
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
npm test
npm run build
```

## Structure

```text
app/page.tsx                       phase, timer, and handler orchestration
components/ChatPanel.tsx           messages, choices, paywall, and victory
components/GameHeader.tsx          model, resources, and current programmer
components/ResourceDashboard.tsx   resource bars and system status panel
lib/game/session.ts                UI types, persistence, and small helpers
lib/game/analytics.ts              anonymous counters and browser consent
lib/engine/card-catalog.ts         standard comic decisions and effects
lib/engine/decision.ts             recovery, deployment, and choice handling
lib/engine/decision-*.ts           decision types, short copy, and stable seeds
lib/engine/simulation.ts           progress, work events, and deployment
lib/engine/token-ledger.ts         single token-charging entry point
lib/engine/usage.ts                costs, context, and weekly limit
lib/engine/resources.ts            extremes, successors, and resource balance
docs/SIMULATION.md                 detailed game mechanics
docs/ARCHITECTURE.md               module boundaries and state flow
```

Usage analytics are disabled until the visitor opts in. After consent, the server issues signed, first-party browser/session identifiers and stores only those random IDs, game IDs, and timestamps. It does not persist IP addresses, user agents, project names, or chat content. Opening `/stats` does not count as a game visit. Disabling analytics removes that browser's existing anonymous record and identifiers.

The public leaderboard is separate from analytics. A completed result is sent only after the player presses **Join the public leaderboard** and the interface lists the fields that will be published.

## Environment

Copy `.env.example` to a local environment file and replace the analytics secret with at least 32 random characters. Production must also set its public HTTPS origin in `NEXT_PUBLIC_SITE_URL`. Do not commit real environment files.

See `AGENTS.md` for the maintenance map and `docs/ARCHITECTURE.md` for detailed dependencies. Removed legacy systems—including the old dialogue engine, character arc, and unused panels—must not be reintroduced.

## Production deployment

`deploy/compose.production.yml` runs an unprivileged, capability-free, read-only container on loopback port `8040`. Its named data volume remains writable for the analytics and leaderboard stores.

The production build uses Next.js standalone output and the system font stack, so it does not need Google Fonts at build time. Runtime does not depend on an external AI or backend API.

`deploy/Caddyfile.vvibecoder` is a hostname-free reverse-proxy template. Keep actual server addresses, credentials, and server-wide proxy configuration outside this repository.
