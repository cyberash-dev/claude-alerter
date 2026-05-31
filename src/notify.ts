import { spawn } from "child_process";
import * as fs from "fs";
import { Config, EventConfig, eventInterval, loadInstalledConfig, resolveSoundPath } from "./config";
import { isTerminalFocused } from "./focus";
import { playSound } from "./sound";
import { triggerHaptic } from "./haptic";
import { cliEntryPath, pidFilePath } from "./paths";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPid(): number | null {
  const file = pidFilePath();
  if (!fs.existsSync(file)) {
    return null;
  }
  const value = Number.parseInt(fs.readFileSync(file, "utf8").trim(), 10);
  return Number.isInteger(value) ? value : null;
}

export function stop(): void {
  const pid = readPid();
  if (pid !== null) {
    try {
      process.kill(pid);
    } catch {
      // Loop already gone — nothing to kill.
    }
  }
  try {
    fs.rmSync(pidFilePath(), { force: true });
  } catch {
    // Best-effort cleanup.
  }
}

function enabledEvent(config: Config, eventName: string): EventConfig | null {
  const ev: EventConfig | undefined = config.events[eventName];
  return ev && ev.enabled ? ev : null;
}

const FOCUS_POLL_MS = 1000;

export function play(eventName: string): void {
  const config = loadInstalledConfig();
  const ev = enabledEvent(config, eventName);
  if (ev === null) {
    return;
  }

  const hasSound = ev.sound !== "";

  // One tactile pulse at event time, regardless of the focus/loop branch
  // below. While away, the sound channel loops; haptic loops only when it is
  // the sole channel (empty sound) — see loop().
  if (ev.haptic === true) {
    triggerHaptic(eventName);
  }

  // Already at the terminal: a single play is enough, no loop.
  if (isTerminalFocused(config.terminals)) {
    if (hasSound) {
      playSound(resolveSoundPath(ev.sound));
    }
    return;
  }

  stop();

  const child = spawn(process.execPath, [cliEntryPath(), "_loop", eventName], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

// Wait up to `intervalMs`, polling focus every FOCUS_POLL_MS so the loop stops
// promptly when the user returns to the terminal. Returns true if focus
// returned during the wait.
async function waitOrFocus(intervalMs: number, terminals: string[]): Promise<boolean> {
  const ticks = Math.max(1, Math.round(intervalMs / FOCUS_POLL_MS));
  for (let i = 0; i < ticks; i += 1) {
    await sleep(FOCUS_POLL_MS);
    if (isTerminalFocused(terminals)) {
      return true;
    }
  }
  return false;
}

export async function loop(eventName: string): Promise<void> {
  const config = loadInstalledConfig();
  const ev = enabledEvent(config, eventName);
  if (ev === null) {
    return;
  }

  fs.writeFileSync(pidFilePath(), String(process.pid));

  const intervalMs = eventInterval(config, eventName) * 1000;
  const maxRepeats = config.max_repeats;

  try {
    if (ev.sound !== "") {
      const soundPath = resolveSoundPath(ev.sound);
      let plays = 0;
      while (true) {
        playSound(soundPath);
        plays += 1;
        if (maxRepeats > 0 && plays >= maxRepeats) {
          break;
        }
        const focused = await waitOrFocus(intervalMs, config.terminals);
        if (focused) {
          break;
        }
      }
    } else {
      // Haptic-only: the event-time pulse already fired in play(), so count it
      // as the first and wait before each subsequent pulse.
      let pulses = 1;
      while (true) {
        if (maxRepeats > 0 && pulses >= maxRepeats) {
          break;
        }
        const focused = await waitOrFocus(intervalMs, config.terminals);
        if (focused) {
          break;
        }
        triggerHaptic(eventName);
        pulses += 1;
      }
    }
  } finally {
    fs.rmSync(pidFilePath(), { force: true });
  }
}

export function test(eventName: string): void {
  const config = loadInstalledConfig();
  const ev: EventConfig | undefined = config.events[eventName];
  if (ev === undefined) {
    throw new Error(`[claude-alerter] no event "${eventName}" in config`);
  }
  if (ev.haptic === true) {
    triggerHaptic(eventName);
  }
  if (ev.sound !== "") {
    playSound(resolveSoundPath(ev.sound));
  }
}
