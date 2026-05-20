import * as fs from "fs";
import * as path from "path";
import { localConfigPath, localSoundsDir } from "./paths";

export interface EventConfig {
  enabled: boolean;
  sound: string;
  interval?: number;
}

export interface Config {
  terminals: string[];
  default_interval: number;
  max_repeats: number;
  events: Record<string, EventConfig>;
}

export const DEFAULT_CONFIG: Config = {
  terminals: [
    "iTerm2",
    "Terminal",
    "Apple_Terminal",
    "Code",
    "Cursor",
    "WindowsTerminal",
    "powershell",
    "cmd",
    "ConEmu",
    "gnome-terminal",
    "konsole",
    "Alacritty",
    "kitty",
    "tmux",
    "ghostty",
  ],
  default_interval: 15,
  max_repeats: 20,
  events: {
    Stop: { enabled: true, sound: "done.wav", interval: 15 },
    Notification: { enabled: true, sound: "question.wav", interval: 15 },
  },
};

function fail(message: string): never {
  throw new Error(`[claude-sound-notify] invalid config: ${message}`);
}

export function loadConfig(configPath: string): Config {
  if (!fs.existsSync(configPath)) {
    fail(`config file not found at ${configPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    fail(`${configPath} is not valid JSON: ${(err as Error).message}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    fail("top-level value must be an object");
  }
  const raw = parsed as Record<string, unknown>;

  if (!Array.isArray(raw.terminals) || !raw.terminals.every((t) => typeof t === "string")) {
    fail("`terminals` must be an array of strings");
  }
  if (typeof raw.default_interval !== "number" || raw.default_interval <= 0) {
    fail("`default_interval` must be a positive number");
  }
  if (typeof raw.max_repeats !== "number" || raw.max_repeats < 0) {
    fail("`max_repeats` must be a non-negative number (0 = unlimited)");
  }
  if (typeof raw.events !== "object" || raw.events === null) {
    fail("`events` must be an object keyed by hook event name");
  }

  const events: Record<string, EventConfig> = {};
  for (const [name, value] of Object.entries(raw.events as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) {
      fail(`event "${name}" must be an object`);
    }
    const ev = value as Record<string, unknown>;
    if (typeof ev.enabled !== "boolean") {
      fail(`event "${name}".enabled must be a boolean`);
    }
    if (typeof ev.sound !== "string" || ev.sound.length === 0) {
      fail(`event "${name}".sound must be a non-empty string`);
    }
    if (ev.interval !== undefined && (typeof ev.interval !== "number" || ev.interval <= 0)) {
      fail(`event "${name}".interval must be a positive number when present`);
    }
    events[name] = {
      enabled: ev.enabled,
      sound: ev.sound,
      interval: ev.interval as number | undefined,
    };
  }

  return {
    terminals: raw.terminals as string[],
    default_interval: raw.default_interval,
    max_repeats: raw.max_repeats,
    events,
  };
}

export function loadInstalledConfig(): Config {
  return loadConfig(localConfigPath());
}

export function resolveSoundPath(soundValue: string): string {
  if (path.isAbsolute(soundValue)) {
    return soundValue;
  }
  return path.join(localSoundsDir(), soundValue);
}

export function eventInterval(config: Config, eventName: string): number {
  const ev: EventConfig | undefined = config.events[eventName];
  return ev?.interval ?? config.default_interval;
}
