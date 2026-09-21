# FORGE

FORGE is a local-first strength-training app built around one core loop: train, record, analyze deterministic history, and use that evidence to decide what should happen next.

## Current focus

The current release gate is **Dogfood Gate 1**: one real gym session must be trustworthy end to end. That means explicit set completion, stable exercise/set identity, reload recovery, one autosync lifecycle, idempotent retries, safe OCC conflict handling, authoritative finish, exact history, and deterministic basic analytics from the same completed working sets.

Broad UI propagation, Brain expansion, naming work, templates, and advanced analytics are intentionally outside this gate.

## Stack

- Vite + React 19 + TypeScript
- Zustand
- Tailwind CSS 4
- React Router 7
- Express
- Firebase Auth / Firestore with server-authoritative writes
- Zod
- Gemini BYOK integration

## Development

Requirements: Node.js 22 and npm.

~~~bash
npm install
npm run dev
~~~

Verification:

~~~bash
npm run lint
npm test
npm run build
~~~

## Reliability invariants

FORGE preserves authenticated server-authoritative mutations, OCC/versioning, idempotency, audit/rollback behavior, canonical exercise identity, deterministic analytics, local-first active-session state, and Firestore client-write restrictions.

See `docs/superpowers/specs/2026-09-21-dogfood-gate-1-design.md` and `docs/superpowers/plans/2026-09-21-dogfood-gate-1.md` for the current gate.
