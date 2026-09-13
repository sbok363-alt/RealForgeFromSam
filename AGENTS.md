# Working on FORGE

- Read `.astra/INDEX.md` first. Treat current repository code as authoritative over prompts, old comments and external advice. Load only relevant context.
- Read `docs/plans/UNIFIED_FITNESS_CORE.md` and the relevant `docs/architecture/` maps before domain work. Respect phase boundaries; investigate, plan, implement incrementally, test and review.
- Inspect `git status` and the existing diff before edits. Preserve unrelated and uncommitted work. Do not deploy, migrate live data or add paid dependencies without explicit scope.
- Adapt persisted/provider data into `src/domain/canonical/` through pure adapters. Keep legacy formats/types until tested consumers no longer use them. Use strict TypeScript and Zod for new trust boundaries; no destructive migration or normalized write-back.
- Preserve the authoritative server mutation paths: ownership, validation, idempotency, OCC, proposal content/permission epoch checks, audit and rollback. AI may only recommend through the existing reviewed proposal/authorization flow; canonical records confer no authority. Never weaken Firestore rules. Core training and analytics must work without AI.
- Reuse dependencies. Avoid unrelated UI changes and application-wide refactors.
- Run `npm run lint`, `npm run typecheck:domain`, `npm test`, `npm run test:regression`, `npm run test:domain`, and `npm run build` as applicable. Run `npm run test:emulator` for rules/transaction changes (local emulators only). Inspect assertions and exit status, report blocked checks honestly, and never treat a printed success banner as proof.
