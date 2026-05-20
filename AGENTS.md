# AGENTS.md

Guidance for AI agents and human contributors working on **claude-sound-notify**.
Read this before changing code. User-facing usage lives in [README.md](./README.md);
this file is about *how the project is built and why*.

## What this is

A cross-platform sound notifier wired into [Claude Code](https://claude.com/claude-code)
hooks. When a hook event fires (`Stop`, `Notification`, …) it plays a sound and
keeps repeating until the user returns focus to their terminal. Everything is
TypeScript compiled to plain JS; the compiled output is what hooks invoke.

## Golden rules

1. **Hooks run compiled JS, not TS.** After editing anything in `src/`, you must
   `npm run build` and then re-install (`node dist/src/cli.js install`) to copy
   the new `dist/` into the runtime dir. Editing `src/` alone changes nothing at
   runtime.
2. **The installer is the only thing that writes `settings.json`.** Never
   hand-edit a user's `~/.claude/settings.json` to add hooks. The merge is
   idempotent and path-matched; reproduce/extend it in `src/settings.ts`.
3. **Never clobber foreign hooks.** The merge matches *our* entries by the
   substrings `sound-notify` + `cli.js` and removes only those (plus legacy
   `notify-until-focused.sh` / `claude-notify-loop.pid`). Any change to matching
   logic must preserve unrelated hooks (kb, lsp, sdd, etc.).
4. **Zero runtime dependencies.** Node stdlib only (`child_process`, `fs`, `os`,
   `path`). The single dev dependency is `typescript` (+ `@types/node`). Do not
   add runtime packages — playback and focus are done by shelling out to native
   OS tools.
5. **Hook-path commands (`play`, `stop`, `_loop`) must never throw to the shell.**
   They are caught in `cli.ts` and forced to exit 0 so a broken config can't spam
   the user with hook errors.

## Commands

```sh
npm install                       # bypass any corporate proxy if it hangs (see below)
npm run build                     # tsc -> dist/
npm run gen-sounds                # regenerate sounds/*.wav (commit the result)
node dist/src/cli.js install [--dry-run] [--config <path>]
node dist/src/cli.js apply        # re-sync hooks from config.json (no file copy)
node dist/src/cli.js uninstall    # remove our hooks + runtime dir
node dist/src/cli.js test <Event> # play an event's sound once
```

There is **no automated test suite**. Verification is manual (see below).

## Architecture

```
src/
  cli.ts        Arg parsing + command dispatch. install/apply/uninstall copy
                files + call settings sync; play/stop/test/_loop call notify.
  notify.ts     Process model: play (detach _loop child or play once if focused),
                _loop (pidfile + repeat + 1s focus poll), stop (kill via pidfile),
                test (play once).
  sound.ts      playSound(file): afplay | PowerShell SoundPlayer | paplay/aplay/
                ffplay/play. WAV input only (Windows SoundPlayer needs WAV).
  focus.ts      frontmostName(): osascript | GetForegroundWindow | xdotool/xprop;
                isTerminalFocused(terminals) substring-matches it. null on Wayland.
  settings.ts   Locate settings.json, back it up, idempotent merge of our hooks.
  config.ts     Config types + loadConfig validator (fail-fast) + sound resolution.
  paths.ts      All path resolution. Runtime paths key off __dirname so the
                installed copy is self-contained.
tools/gen-sounds.ts   Pure-Node 16-bit PCM WAV synth. No deps.
```

### Runtime layout (created by `install`)

```
~/.claude/sound-notify/
  *.js           copied from dist/src/
  sounds/*.wav   copied from repo sounds/
  config.json    seeded from config.example.json on first install; NEVER overwritten
```

`paths.ts` resolves config + sounds relative to `__dirname`, so at runtime they
sit next to the installed `cli.js`. During dev (`dist/src/cli.js`) the install
command instead reads source paths via `repo*` helpers.

## Behavior contract (don't regress these)

- **Focused at event time → play once, no loop.** (`notify.play`)
- **Not focused → loop until the terminal regains focus.** Stop condition is
  focus, polled every `FOCUS_POLL_MS` (1s) regardless of the per-event
  `interval`. (`notify.loop` / `waitOrFocus`)
- **`max_repeats`** caps the loop so an away user isn't nagged forever
  (`0` = unlimited). On Wayland (no focus read) this is the only automatic stop
  besides the `UserPromptSubmit` backstop.
- **`UserPromptSubmit → stop`** is a backstop, not the primary stop. It must
  never end the loop earlier than a real focus return (submitting implies the
  user is already at the terminal).
- The hook command embeds the **absolute `node` path** captured at install time
  (`process.execPath`). Switching Node versions requires re-running `install`.

## Manual verification

```sh
npm run build && node dist/src/cli.js install --dry-run   # inspect the merge
node dist/src/cli.js install                              # check backup created
jq '.hooks' ~/.claude/settings.json                       # our hooks + foreign hooks intact
node ~/.claude/sound-notify/cli.js test Stop              # one chime
```

**Focus tests are environment-sensitive:** `frontmostName()` returns whatever
GUI app is actually frontmost, which changes as you click around. To test the
loop deterministically, set `terminals` to match the app that is frontmost
*while the test runs* (your terminal, if commands run there), start
`node cli.js _loop <Event>`, and confirm the pidfile (`$TMPDIR/claude-sound-notify.pid`)
disappears within ~1-2s. Restore config afterward.

## Conventions

- TypeScript `strict`. Annotate every function argument and non-void return.
  Prefer specific types over `any`/`object`.
- Self-documenting names; comments only for non-obvious *why* (e.g. the
  "play once if focused" branch, the focus-poll rationale).
- Surgical changes — match surrounding style, don't refactor unrelated code.
- Commit `sounds/*.wav` (generated assets are part of the repo). Don't commit
  `dist/` or `node_modules/` (see `.gitignore`).

## Environment gotcha (this dev machine)

If `npm install` hangs, it's the corporate proxy routing the internal npm
registry through an external proxy. Install with the proxy bypassed:

```sh
env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy npm install
```

This is machine-specific, not a project requirement.
