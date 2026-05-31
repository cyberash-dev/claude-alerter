# AGENTS.md

Guidance for AI agents and human contributors working on **claude-alerter**.
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
   substrings `notifier` + `cli.js` and removes only those (plus legacy
   `notify-until-focused.sh` / `claude-notify-loop.pid`). Any change to matching
   logic must preserve unrelated hooks (kb, lsp, sdd, etc.).
4. **Zero runtime dependencies in the Node notifier.** The TypeScript notifier
   uses Node stdlib only (`child_process`, `fs`, `os`, `path`); its single dev
   dependency is `typescript` (+ `@types/node`). Playback and focus shell out to
   native OS tools. The optional haptic channel (`ClaudeHapticPlugin/`) is a
   **separate C# subproject** with its own .NET toolchain and NuGet/Logi deps —
   it is never imported by the Node side. The two communicate only through the
   file-trigger bridge (see "Haptic channel" below). Do not add runtime packages
   to the Node side.
5. **Hook-path commands (`play`, `stop`, `_loop`) must never throw to the shell.**
   They are caught in `cli.ts` and forced to exit 0 so a broken config can't spam
   the user with hook errors.

## Commands

```sh
npm install                       # bypass any corporate proxy if it hangs (see below)
npm run build                     # tsc -> dist/
npm test                          # tsc -p tsconfig.test.json + node --test dist/test
npm run gen-sounds                # regenerate sounds/*.wav (commit the result)
node dist/src/cli.js install [--dry-run] [--config <path>] [--logitech-haptic]
node dist/src/cli.js apply        # re-sync hooks from config.json (no file copy)
node dist/src/cli.js uninstall    # remove our hooks + runtime dir
node dist/src/cli.js doctor       # report per-OS audio/focus deps (exit 1 if no player)
node dist/src/cli.js test <Event> # play an event's sound once
```

Automated tests cover the platform-agnostic logic (`config`, `settings`,
`preflight` mapping) under `test/*.test.ts`, run via Node's built-in runner and
exercised on macOS/Windows/Linux in CI (`.github/workflows/ci.yml`). Platform
behavior that needs a real GUI/audio device (focus polling, actual playback) is
still verified manually (see below).

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
                audioPlayerAvailable() / describePlayer() back the preflight check.
  focus.ts      frontmostName(): osascript | GetForegroundWindow | xdotool/xprop;
                isTerminalFocused(terminals) substring-matches it. null on Wayland.
                describeFocus() reports availability + reason per OS.
  system.ts     Shared OS probes: commandExists, readOsRelease,
                detectPackageManager (apt/dnf/pacman/zypper/apk).
  preflight.ts  collectDiagnostics + renderDiagnostics: per-OS audio/focus status
                and, on Linux, the distro-specific install command for what's
                missing. linuxInstallCommands(pm) is the pure mapping.
  haptic-setup.ts  install-time, only with --logitech-haptic: best-effort builds
                the C# plugin (dotnet + LogiPluginTool) when feasible, else prints
                manual steps. No-op message on Linux (no Logi SDK there).
  settings.ts   Locate settings.json, back it up, idempotent merge of our hooks.
  config.ts     Config types + loadConfig validator (fail-fast) + sound resolution.
  paths.ts      All path resolution. Runtime paths key off __dirname so the
                installed copy is self-contained.
tools/gen-sounds.ts   Pure-Node 16-bit PCM WAV synth. No deps.
test/*.test.ts        node:test specs for config/settings/preflight (no deps).
```

### Runtime layout (created by `install`)

```
~/.claude/notifier/
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
- **`sound: ""` → haptic-only.** The sound channel is skipped everywhere
  (`play`/`loop`/`test`). The looping channel becomes haptic: the event-time
  pulse fires in `play()`, then `loop()` repeats it at `interval`. Config
  validation rejects an enabled event with empty `sound` and `haptic !== true`.
- **`max_repeats`** caps the loop so an away user isn't nagged forever
  (`0` = unlimited). On Wayland (no focus read) this is the only automatic stop
  besides the `UserPromptSubmit` backstop.
- **`UserPromptSubmit → stop`** is a backstop, not the primary stop. It must
  never end the loop earlier than a real focus return (submitting implies the
  user is already at the terminal).
- The hook command embeds the **absolute `node` path** captured at install time
  (`process.execPath`). Switching Node versions requires re-running `install`.

## Haptic channel (Logitech MX Master 4)

An optional second notification channel vibrates an MX Master 4. It is split
across the two languages and joined by a file bridge — keep the two sides
decoupled.

```
src/haptic.ts        triggerHaptic(event): best-effort writes a one-shot
                     <pid>-<hrtime>.trigger file (content = event name) into
                     hapticTriggerDir(). Never throws (golden rule #5).
                     Called in notify.play() and notify.test(); alongside a
                     sound it fires once. For a haptic-only event (sound: "")
                     loop() repeats it at interval. No-op on Linux (no Logi SDK
                     there, so a trigger would never be consumed).
ClaudeHapticPlugin/  C# .NET Logi Options+ plugin. Plugin.Load() registers one
                     event per waveform (AddEvent) and starts a FileSystemWatcher
                     on the trigger dir; on a new file it reads the trigger name,
                     plays it, then deletes the file. events/extra/eventMapping.yaml
                     maps each event -> its waveform 1:1.
```

The SDK plays one waveform per `RaiseEvent` and has no native sequencing, so
"melodies" are composed in the plugin as a timed sequence of single-waveform
events (`Patterns` in `ClaudeHapticPlugin.cs`: a `HapticStep[]` of
waveform + post-delay per Claude event), played on a background thread. To change
a melody, edit `Patterns` and the registered `Waveforms` set, then mirror new
waveform names in `eventMapping.yaml`. The SDK catalog (15 waveforms) is wider
than what the patterns use — see `ClaudeHapticPlugin.cs`.

Trigger-name protocol (file content):

- `<ClaudeEvent>` (e.g. `Stop`) — plays that event's pattern.
- `wf:<waveform>` (e.g. `wf:jingle`) — plays one raw waveform; a dev affordance
  for auditioning/tuning waveforms (`echo wf:wave > <dir>/x.trigger`). Only
  waveforms in the registered `Waveforms` set resolve.

Bridge contract (the only coupling between the two sides):

- Directory: `~/.claude/notifier/haptic/` (`hapticTriggerDir()` in
  `paths.ts`; the C# side derives the same path from `CLAUDE_CONFIG_DIR` or
  `~/.claude`). One file per event; filename is throwaway; content is the
  event name. The plugin deletes each file after handling it.
- Event names must match on both sides. The Node side writes the raw Claude
  event name; the plugin registers and maps events under those exact names
  (`KnownEvents` in `ClaudeHapticPlugin.cs`, keys in `eventMapping.yaml`).
- `haptic?: boolean` per event in `config.ts` (default off) gates whether the
  Node side writes a trigger at all. This field is owned by the installer, not
  hand-edited: each `cli install` sets `haptic` on every event to match whether
  `--logitech-haptic` was passed (`applyHapticFlag` in `cli.ts`, on raw JSON so
  the rest of the config is untouched). `apply`/`uninstall` never touch it.

Rules:

- A missing/disabled plugin must never affect the sound channel: trigger
  writes are best-effort and the file is simply ignored if nothing reads it.
- The plugin needs the **.NET SDK** + **LogiPluginTool**
  (`dotnet tool install --global LogiPluginTool`). On this machine the runtime
  is resolved via `DOTNET_ROOT=/opt/homebrew/opt/dotnet/libexec` and
  `DOTNET_ROLL_FORWARD=Major` (LogiPluginTool targets net8.0; only the net10
  SDK is installed) — `haptic-setup.ts` sets `DOTNET_ROLL_FORWARD=Major` for the
  same reason. `cli.js install --logitech-haptic` now drives `haptic-setup.ts`,
  which best-effort installs LogiPluginTool and runs `dotnet build -c Release`
  when `dotnet` and the plugin sources are present, otherwise prints the manual
  steps. A `dotnet build -c Release` dev-links it into Logi Plugin Service; for a
  portable install use `LogiPluginTool pack` + `install`. Haptics are MX Master
  4 only and require Logi Options+ running; Linux is unsupported.

## Manual verification

```sh
npm run build && node dist/src/cli.js install --dry-run   # inspect the merge
node dist/src/cli.js install                              # check backup created
jq '.hooks' ~/.claude/settings.json                       # our hooks + foreign hooks intact
node ~/.claude/notifier/cli.js test Stop              # one chime
```

**Focus tests are environment-sensitive:** `frontmostName()` returns whatever
GUI app is actually frontmost, which changes as you click around. To test the
loop deterministically, set `terminals` to match the app that is frontmost
*while the test runs* (your terminal, if commands run there), start
`node cli.js _loop <Event>`, and confirm the pidfile (`$TMPDIR/claude-alerter.pid`)
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
