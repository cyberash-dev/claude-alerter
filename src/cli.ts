#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { loadConfig } from "./config";
import { describePlayer } from "./sound";
import { focusDetectionAvailable } from "./focus";
import { loop, play, stop, test } from "./notify";
import { removeOurHooks, syncSettings } from "./settings";
import {
  repoConfigExamplePath,
  repoDistSrcDir,
  repoSoundsDir,
  runtimeInstallDir,
} from "./paths";

interface Flags {
  dryRun: boolean;
  configPath: string | null;
}

function parseFlags(args: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = { dryRun: false, configPath: null };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--config") {
      flags.configPath = args[i + 1] ?? null;
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
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

function runInstall(flags: Flags): void {
  copyRuntimeFiles();
  const configPath = ensureRuntimeConfig(flags.configPath);
  const config = loadConfig(configPath);
  const result = syncSettings(config, flags.dryRun);

  if (flags.dryRun) {
    return;
  }
  process.stdout.write(`Installed runtime to ${runtimeInstallDir()}\n`);
  process.stdout.write(`Config: ${configPath}\n`);
  process.stdout.write(`Audio player: ${describePlayer()}\n`);
  process.stdout.write(`Focus detection: ${focusDetectionAvailable() ? "yes" : "no (uses max_repeats + stop hook)"}\n`);
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
  process.stdout.write("Removed hooks and runtime directory.\n");
  if (result.backupFile !== null) {
    process.stdout.write(`Backed up settings to ${result.backupFile}\n`);
  }
}

function usage(): void {
  process.stdout.write(
    [
      "claude-sound-notify",
      "",
      "Usage:",
      "  cli install [--dry-run] [--config <path>]   copy runtime + merge hooks",
      "  cli apply   [--dry-run]                      re-sync hooks from config.json",
      "  cli uninstall [--dry-run]                    remove hooks + runtime dir",
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
