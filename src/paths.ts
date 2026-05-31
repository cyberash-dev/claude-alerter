import * as os from "os";
import * as path from "path";

const MODULE_DIR: string = __dirname;

export function claudeDir(): string {
  const override: string | undefined = process.env.CLAUDE_CONFIG_DIR;
  return override && override.length > 0
    ? override
    : path.join(os.homedir(), ".claude");
}

export function settingsPath(): string {
  return path.join(claudeDir(), "settings.json");
}

export function runtimeInstallDir(): string {
  return path.join(claudeDir(), "notifier");
}

export function legacyRuntimeInstallDir(): string {
  return path.join(claudeDir(), "sound-notify");
}

export function pidFilePath(): string {
  return path.join(os.tmpdir(), "claude-alerter.pid");
}

export function hapticTriggerDir(): string {
  return path.join(runtimeInstallDir(), "haptic");
}

export function localConfigPath(): string {
  return path.join(MODULE_DIR, "config.json");
}

export function localSoundsDir(): string {
  return path.join(MODULE_DIR, "sounds");
}

export function cliEntryPath(): string {
  return path.join(MODULE_DIR, "cli.js");
}

export function repoRoot(): string {
  return path.resolve(MODULE_DIR, "..", "..");
}

export function repoDistSrcDir(): string {
  return MODULE_DIR;
}

export function repoSoundsDir(): string {
  return path.join(repoRoot(), "sounds");
}

export function repoConfigExamplePath(): string {
  return path.join(repoRoot(), "config.example.json");
}

export function repoHapticPluginDir(): string {
  return path.join(repoRoot(), "ClaudeHapticPlugin");
}
