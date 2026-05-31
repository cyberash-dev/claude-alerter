# claude-alerter

Cross-platform sound notifier for [Claude Code](https://claude.com/claude-code)
hooks. Plays a sound — on repeat until your terminal is focused — when Claude
finishes a turn or needs your input. Works on macOS, Windows, and Linux.

- **Configurable events** — map any Claude hook event (`Stop`, `Notification`,
  `SubagentStop`, `SessionEnd`, …) to a sound.
- **Configurable sounds** — bundled WAV chimes, or point at any `.wav`.
- **Idempotent installer** — merges only its own hooks into `settings.json`,
  backs the file up first, and never touches your other hooks.

## Requirements

- [Node.js](https://nodejs.org/) (used both to install and at hook runtime).
- A system audio player:
  - macOS: `afplay` (built in — nothing to install).
  - Windows: PowerShell `Media.SoundPlayer` (built in — nothing to install).
  - Linux: one of `paplay`, `aplay`, `ffplay`, or `play` (sox). For the loop to
    stop on focus under X11, also `xdotool` + `xprop`.

Run `claude-alerter doctor` (or `node dist/src/cli.js doctor`) to check what
your OS has and, on Linux, print the exact install command for your distro
(apt/dnf/pacman/zypper/apk). `install` prints the same report.

## Install

From npm (no clone needed):

```sh
npx claude-alerter install
```

Or install globally and run the `claude-alerter` command directly:

```sh
npm install -g claude-alerter
claude-alerter install
```

From source:

```sh
git clone https://github.com/cyberash-dev/claude-alerter.git
cd claude-alerter
npm install
npm run build
node dist/src/cli.js install
```

The installer:
1. copies the compiled notifier + `sounds/` to `~/.claude/notifier/`,
2. creates `~/.claude/notifier/config.json` (from `config.example.json`)
   if it does not already exist,
3. backs up `~/.claude/settings.json` to `settings.json.bak-<timestamp>`,
4. merges the hooks for every enabled event plus a `UserPromptSubmit` stop hook.

Then open `/hooks` once in Claude Code (or restart it) so the new hooks load.

Preview without writing anything:

```sh
node dist/src/cli.js install --dry-run
```

## Configure

Edit `~/.claude/notifier/config.json`, then re-apply:

```sh
node ~/.claude/notifier/cli.js apply
```

```json
{
  "terminals": ["iTerm2", "WindowsTerminal", "gnome-terminal", "..."],
  "default_interval": 15,
  "max_repeats": 20,
  "events": {
    "Stop":         { "enabled": true,  "sound": "done.wav",     "interval": 15, "haptic": false },
    "Notification": { "enabled": true,  "sound": "question.wav", "interval": 15, "haptic": false },
    "SubagentStop": { "enabled": false, "sound": "tick.wav" }
  }
}
```

- `terminals` — substrings matched (case-insensitive) against the focused
  app/window name. When a match is focused, the loop stops.
- `default_interval` — seconds between repeats when an event omits `interval`.
- `max_repeats` — stop after this many plays even if focus is never detected
  (`0` = unlimited). Acts as a cap on Linux/Wayland where focus can't be read.
- `events.<HookEvent>` — `enabled`, `sound` (a name under `sounds/` or an
  absolute path), optional `interval`, and optional `haptic` (see below). Add
  any Claude hook event key here. `haptic` is controlled by the
  `--logitech-haptic` install flag, not by hand — each `install` overwrites it.
  Set `sound` to `""` for a haptic-only event (no sound plays). An enabled
  event must have either a non-empty `sound` or `haptic` — an enabled event
  with neither is rejected as a no-op.

Disable an event (`"enabled": false`) and run `apply` to drop its hook;
re-enable and `apply` to add it back. Re-running is always safe — no duplicates.

## How it stops

- If your terminal is **already focused** when the event fires, the sound plays
  **once** — no loop.
- Otherwise it repeats until you **return to the terminal**. Focus is polled
  once per second, so the sound stops within ~1s of you switching back —
  independent of the (longer) repeat `interval`.
- A `UserPromptSubmit` hook also calls `stop` as a backstop. This never stops
  the loop early (submitting a prompt means you are already at the terminal);
  it mainly covers Linux/Wayland where focus can't be read, alongside
  `max_repeats`.

## Haptic notifications (Logitech MX Master 4)

Optional second channel: a tactile pulse on a Logitech MX Master 4 when an event
fires, alongside the sound. It is driven by a companion Logi Options+ plugin in
[`ClaudeHapticPlugin/`](./ClaudeHapticPlugin) and is off unless you opt in.

How it works: when `haptic` is enabled for an event, the notifier drops a one-shot
trigger file into `~/.claude/notifier/haptic/`. The plugin watches that
directory and raises a haptic event, which Logi Options+ maps to a waveform. The
two sides are fully decoupled — if the plugin is not installed, the trigger file
is simply ignored and the sound channel is unaffected. Alongside a sound the pulse
fires **once** at event time and does not loop (looping is the sound channel's
job). For a haptic-only event (`sound: ""`) there is no sound channel, so the
pulse itself loops at `interval` until you return to the terminal.

Requirements:

- A Logitech **MX Master 4** and **Logi Options+** installed and running (the only
  device the Actions SDK exposes haptics for).
- To build the plugin: the **.NET SDK** and **LogiPluginTool**
  (`dotnet tool install --global LogiPluginTool`).

Enable it:

1. Build and load the plugin (dev build links it into Logi Plugin Service and
   triggers a reload):

   ```sh
   cd ClaudeHapticPlugin
   dotnet build src/ClaudeHapticPlugin.csproj -c Release
   ```

   For a portable install independent of the repo path, package and install it:

   ```sh
   LogiPluginTool pack ./bin/Release ./ClaudeHaptic.lplug4
   LogiPluginTool install ./ClaudeHaptic.lplug4
   ```

2. Turn the haptic channel on by installing with the flag:

   ```sh
   node dist/src/cli.js install --logitech-haptic
   ```

   When `dotnet` and the plugin sources are present (a from-source checkout),
   this builds and links the plugin for you (installing `LogiPluginTool` first if
   needed); otherwise it prints the manual build steps above. On Linux it is a
   no-op (no Logi SDK). The flag sets `haptic` on every event in
   `~/.claude/notifier/config.json`.
   Haptic state always mirrors the flag: re-running `install` **without**
   `--logitech-haptic` disables it again. (Hand-edits to `haptic` are reset on
   the next `install`; the sound channel is unaffected.)

3. Verify: `node ~/.claude/notifier/cli.js test Stop` should buzz the mouse
   (and play the sound). Each event plays a short haptic *pattern* (a tuned
   sequence of waveforms — e.g. Stop is `wave → happy_alert`), defined on the
   plugin side in `Patterns` in `ClaudeHapticPlugin/src/ClaudeHapticPlugin.cs`
   with the waveforms declared in
   `ClaudeHapticPlugin/src/package/events/extra/eventMapping.yaml`. Edit those to
   change the melodies.

## Commands

```sh
node dist/src/cli.js install [--dry-run] [--config <path>] [--logitech-haptic]
node ~/.claude/notifier/cli.js apply   [--dry-run]
node ~/.claude/notifier/cli.js uninstall [--dry-run]
node ~/.claude/notifier/cli.js doctor         # check per-OS deps
node ~/.claude/notifier/cli.js test <Event>   # play a sound once
```

`doctor` reports the audio player and focus-detection status for your OS and, if
something is missing on Linux, the install command for your distro. It exits
non-zero when no audio player is available.

`uninstall` removes the hooks (after a backup) and deletes
`~/.claude/notifier/`.

## Sounds

`sounds/*.wav` are generated by `tools/gen-sounds.ts` (pure Node, no deps):

```sh
npm run gen-sounds
```

WAV is used because it plays natively on all three platforms without extra
codecs. Replace them or point `sound` at your own `.wav`.

## Platform notes

- **macOS** — focus via AppleScript (`System Events`). The first run may prompt
  for Automation permission for your terminal; approve it once.
- **Windows** — focus via `GetForegroundWindow`; hooks invoke
  `node …\cli.js`. PowerShell `Media.SoundPlayer` plays WAV only.
- **Linux** — focus via `xdotool`/`xprop` on X11. On Wayland focus can't be
  read, so the loop relies on `max_repeats` and the prompt-submit stop.
