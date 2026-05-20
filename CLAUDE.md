# CLAUDE.md

All contributor and agent guidance for this repository lives in
[AGENTS.md](./AGENTS.md). Read it before making any changes.

Quick reminders (full detail in AGENTS.md):

- Hooks run **compiled** JS — after editing `src/`, run `npm run build` and
  re-install (`node dist/src/cli.js install`) to take effect.
- Only `src/settings.ts` writes `~/.claude/settings.json`; the merge is
  idempotent and must never touch hooks it didn't create.
- Zero runtime dependencies — Node stdlib only.
- No automated tests; verify manually (`cli test`, `_loop` + pidfile check).
