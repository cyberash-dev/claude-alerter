#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { loadConfig } from "./config";
import { collectDiagnostics, renderDiagnostics } from "./preflight";
import { setupHaptic } from "./haptic-setup";
import { loop, play, stop, test } from "./notify";
import { removeOurHooks, syncSettings } from "./settings";
import {
  legacyRuntimeInstallDir,
  repoConfigExamplePath,
  repoDistSrcDir,
  repoSoundsDir,
  runtimeInstallDir,
} from "./paths";

interface Flags {
  dryRun: boolean;
  configPath: string | null;
  logitechHaptic: boolean;
}

function parseFlags(args: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = { dryRun: false, configPath: null, logitechHaptic: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--logitech-haptic") {
      flags.logitechHaptic = true;
    } else if (arg === "--config") {
      flags.configPath = args[i + 1] ?? null;
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

// Carry a pre-rename install (~/.claude/sound-notify) over to the current dir
// so the user keeps their config.json and sounds across the rename.
function migrateLegacyRuntimeDir(): void {
  const legacy = legacyRuntimeInstallDir();
  const current = runtimeInstallDir();
  if (legacy !== current && fs.existsSync(legacy) && !fs.existsSync(current)) {
    fs.renameSync(legacy, current);
  }
}

function copyRuntimeFiles(): void {
  const dest = runtimeInstallDir();
  fs.mkdirSync(dest, { recursive: true });

  const srcDir = repoDistSrcDir();
  for (const name of fs.readdirSync(srcDir)) {
    if (name.endsWith(".js")) {
      fs.copyFileSync(path.join(srcDir, name), path.join(dest, name));
    }
  }

  fs.cpSync(repoSoundsDir(), path.join(dest, "sounds"), { recursive: true });
}

function ensureRuntimeConfig(flagConfig: string | null): string {
  const dest = path.join(runtimeInstallDir(), "config.json");
  if (flagConfig !== null) {
    fs.copyFileSync(flagConfig, dest);
  } else if (!fs.existsSync(dest)) {
    fs.copyFileSync(repoConfigExamplePath(), dest);
  }
  return dest;
}

// Each install sets the per-event `haptic` field to match whether
// --logitech-haptic was passed. Operates on raw JSON so unknown keys and the
// rest of the user's config are preserved untouched; validation errors are left
// to the subsequent loadConfig.
function applyHapticFlag(configPath: string, enabled: boolean, dryRun: boolean): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return;
  }
  const events = (parsed as Record<string, unknown>).events;
  if (typeof events !== "object" || events === null) {
    return;
  }
  for (const value of Object.values(events as Record<string, unknown>)) {
    if (typeof value === "object" && value !== null) {
      (value as Record<string, unknown>).haptic = enabled;
    }
  }
  if (!dryRun) {
    fs.writeFileSync(configPath, `${JSON.stringify(parsed, null, 2)}\n`);
  }
}

function runInstall(flags: Flags): void {
  if (!flags.dryRun) {
    migrateLegacyRuntimeDir();
  }
  copyRuntimeFiles();
  const configPath = ensureRuntimeConfig(flags.configPath);
  applyHapticFlag(configPath, flags.logitechHaptic, flags.dryRun);
  const config = loadConfig(configPath);
  const result = syncSettings(config, flags.dryRun);

  process.stdout.write(`${renderDiagnostics(collectDiagnostics())}\n`);
  if (flags.logitechHaptic) {
    setupHaptic(flags.dryRun);
  } else {
    process.stdout.write("Haptic: disabled\n");
  }

  if (flags.dryRun) {
    return;
  }
  process.stdout.write(`Installed runtime to ${runtimeInstallDir()}\n`);
  process.stdout.write(`Config: ${configPath}\n`);
  process.stdout.write(`Enabled events: ${result.enabledEvents.join(", ") || "(none)"}\n`);
  if (result.backupFile !== null) {
    process.stdout.write(`Backed up settings to ${result.backupFile}\n`);
  }
  process.stdout.write("Done. Open /hooks once or restart Claude Code to load the hooks.\n");
}

function runApply(flags: Flags): void {
  const configPath = path.join(runtimeInstallDir(), "config.json");
  const config = loadConfig(configPath);
  const result = syncSettings(config, flags.dryRun);
  if (!flags.dryRun) {
    process.stdout.write(`Re-synced hooks for: ${result.enabledEvents.join(", ") || "(none)"}\n`);
    if (result.backupFile !== null) {
      process.stdout.write(`Backed up settings to ${result.backupFile}\n`);
    }
  }
}

function runUninstall(flags: Flags): void {
  const result = removeOurHooks(flags.dryRun);
  if (flags.dryRun) {
    return;
  }
  fs.rmSync(runtimeInstallDir(), { recursive: true, force: true });
  fs.rmSync(legacyRuntimeInstallDir(), { recursive: true, force: true });
  process.stdout.write("Removed hooks and runtime directory.\n");
  if (result.backupFile !== null) {
    process.stdout.write(`Backed up settings to ${result.backupFile}\n`);
  }
}

function runDoctor(): void {
  const diagnostics = collectDiagnostics();
  process.stdout.write(`${renderDiagnostics(diagnostics)}\n`);
  if (!diagnostics.audioAvailable) {
    process.exitCode = 1;
  }
}

function usage(): void {
  process.stdout.write(
    [
      "claude-alerter",
      "",
      "Usage:",
      "  cli install [--dry-run] [--config <path>] [--logitech-haptic]",
      "                                              copy runtime + merge hooks",
      "  cli apply   [--dry-run]                      re-sync hooks from config.json",
      "  cli uninstall [--dry-run]                    remove hooks + runtime dir",
      "  cli doctor                                   check audio/focus deps per OS",
      "  cli test <Event>                             play an event's sound once",
      "  cli play <Event>                             (hook) start looping notifier",
      "  cli stop                                     (hook) stop the looping notifier",
      "",
    ].join("\n"),
  );
}

function main(): void {
  const { positional, flags } = parseFlags(process.argv.slice(2));
  const command = positional[0] ?? "";

  switch (command) {
    case "install":
      runInstall(flags);
      return;
    case "apply":
      runApply(flags);
      return;
    case "uninstall":
      runUninstall(flags);
      return;
    case "doctor":
      runDoctor();
      return;
    case "test": {
      const event = positional[1];
      if (event === undefined) {
        throw new Error("usage: cli test <Event>");
      }
      test(event);
      return;
    }
    case "play": {
      const event = positional[1];
      if (event !== undefined) {
        play(event);
      }
      return;
    }
    case "stop":
      stop();
      return;
    case "_loop": {
      const event = positional[1];
      if (event !== undefined) {
        void loop(event);
      }
      return;
    }
    default:
      usage();
      process.exitCode = command === "" || command === "help" || command === "--help" ? 0 : 1;
  }
}

const HOOK_COMMANDS = new Set(["play", "stop", "_loop"]);

try {
  main();
} catch (err) {
  const command = process.argv[2] ?? "";
  if (HOOK_COMMANDS.has(command)) {
    process.exitCode = 0;
  } else {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}
