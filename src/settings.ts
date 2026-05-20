import * as fs from "fs";
import * as path from "path";
import { Config } from "./config";
import { runtimeInstallDir, settingsPath } from "./paths";

interface HookEntry {
  type?: string;
  command?: string;
  [key: string]: unknown;
}
interface HookGroup {
  matcher?: string;
  hooks: HookEntry[];
  [key: string]: unknown;
}
interface Settings {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

const STOP_EVENT = "UserPromptSubmit";

function installedCliPath(): string {
  return path.join(runtimeInstallDir(), "cli.js");
}

function buildCommand(subcommand: string): string {
  return `"${process.execPath}" "${installedCliPath()}" ${subcommand}`;
}

function isOurCommand(command: string): boolean {
  return command.includes("sound-notify") && command.includes("cli.js");
}

function isLegacyCommand(command: string): boolean {
  return command.includes("notify-until-focused.sh") || command.includes("claude-notify-loop.pid");
}

function shouldRemove(entry: HookEntry): boolean {
  if (typeof entry.command !== "string") {
    return false;
  }
  return isOurCommand(entry.command) || isLegacyCommand(entry.command);
}

function stripOurHooks(settings: Settings): void {
  const hooks = settings.hooks;
  if (hooks === undefined) {
    return;
  }
  for (const event of Object.keys(hooks)) {
    const groups = hooks[event];
    const kept: HookGroup[] = [];
    for (const group of groups) {
      group.hooks = (group.hooks ?? []).filter((entry) => !shouldRemove(entry));
      if (group.hooks.length > 0) {
        kept.push(group);
      }
    }
    if (kept.length > 0) {
      hooks[event] = kept;
    } else {
      delete hooks[event];
    }
  }
}

function addGroup(settings: Settings, event: string, command: string): void {
  if (settings.hooks === undefined) {
    settings.hooks = {};
  }
  if (settings.hooks[event] === undefined) {
    settings.hooks[event] = [];
  }
  settings.hooks[event].push({ hooks: [{ type: "command", command }] });
}

export function computeSettings(current: Settings, config: Config): Settings {
  const next: Settings = JSON.parse(JSON.stringify(current));
  stripOurHooks(next);

  for (const [event, ev] of Object.entries(config.events)) {
    if (ev.enabled) {
      addGroup(next, event, buildCommand(`play ${event}`));
    }
  }
  addGroup(next, STOP_EVENT, buildCommand("stop"));

  return next;
}

function readSettings(): Settings {
  const file = settingsPath();
  if (!fs.existsSync(file)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Settings;
}

export interface SyncResult {
  settingsFile: string;
  backupFile: string | null;
  enabledEvents: string[];
  dryRun: boolean;
}

export function syncSettings(config: Config, dryRun: boolean): SyncResult {
  const file = settingsPath();
  const current = readSettings();
  const next = computeSettings(current, config);
  const enabledEvents = Object.entries(config.events)
    .filter(([, ev]) => ev.enabled)
    .map(([name]) => name);

  if (dryRun) {
    process.stdout.write(`# settings file: ${file}\n`);
    process.stdout.write(`# enabled events: ${enabledEvents.join(", ") || "(none)"}\n`);
    process.stdout.write(`# UserPromptSubmit stop hook: yes\n`);
    process.stdout.write("# resulting hooks block:\n");
    process.stdout.write(`${JSON.stringify({ hooks: next.hooks }, null, 2)}\n`);
    return { settingsFile: file, backupFile: null, enabledEvents, dryRun: true };
  }

  let backupFile: string | null = null;
  if (fs.existsSync(file)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    backupFile = `${file}.bak-${ts}`;
    fs.copyFileSync(file, backupFile);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return { settingsFile: file, backupFile, enabledEvents, dryRun: false };
}

export function removeOurHooks(dryRun: boolean): SyncResult {
  const file = settingsPath();
  const current = readSettings();
  const next: Settings = JSON.parse(JSON.stringify(current));
  stripOurHooks(next);

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ hooks: next.hooks }, null, 2)}\n`);
    return { settingsFile: file, backupFile: null, enabledEvents: [], dryRun: true };
  }

  let backupFile: string | null = null;
  if (fs.existsSync(file)) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    backupFile = `${file}.bak-${ts}`;
    fs.copyFileSync(file, backupFile);
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  }
  return { settingsFile: file, backupFile, enabledEvents: [], dryRun: false };
}
