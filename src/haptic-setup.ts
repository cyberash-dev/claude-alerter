import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { repoHapticPluginDir } from "./paths";
import { commandExists } from "./system";

const DOTNET_ENV = { ...process.env, DOTNET_ROLL_FORWARD: "Major" };

function csprojPath(): string {
  return path.join(repoHapticPluginDir(), "src", "ClaudeHapticPlugin.csproj");
}

function logiPluginToolInstalled(): boolean {
  const result = spawnSync("dotnet", ["tool", "list", "--global"], {
    encoding: "utf8",
    env: DOTNET_ENV,
  });
  if (result.status !== 0 || typeof result.stdout !== "string") {
    return false;
  }
  return result.stdout.toLowerCase().includes("logiplugintool");
}

function runStep(label: string, cmd: string, args: string[], cwd?: string): boolean {
  process.stdout.write(`  ${label}...\n`);
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd, env: DOTNET_ENV });
  return result.status === 0;
}

const MANUAL_STEPS = [
  "Manual steps (see README → Haptic notifications):",
  "  dotnet tool install --global LogiPluginTool",
  "  cd ClaudeHapticPlugin && dotnet build src/ClaudeHapticPlugin.csproj -c Release",
].join("\n");

// Best-effort haptic toolchain setup, run only when `install --logitech-haptic`
// is used. Automates what it safely can (LogiPluginTool + plugin build) when the
// prerequisites exist; otherwise prints the manual steps. Logi Options+ and the
// MX Master 4 itself cannot be provisioned here.
export function setupHaptic(dryRun: boolean): void {
  if (process.platform === "linux") {
    process.stdout.write(
      "Haptic: not supported on Linux (Logitech Options+ SDK has no Linux build); sound channel is unaffected.\n",
    );
    return;
  }

  if (dryRun) {
    process.stdout.write("Haptic: would build/install the Logitech plugin (dry-run).\n");
    return;
  }

  if (!commandExists("dotnet")) {
    process.stdout.write(
      "Haptic: .NET SDK not found. Install it from https://dotnet.microsoft.com/download, then:\n",
    );
    process.stdout.write(`${MANUAL_STEPS}\n`);
    return;
  }

  if (!fs.existsSync(csprojPath())) {
    process.stdout.write(
      "Haptic: plugin sources not found (installed without the repo). Clone the repo and run:\n",
    );
    process.stdout.write(`${MANUAL_STEPS}\n`);
    return;
  }

  process.stdout.write("Haptic: setting up the Logitech plugin...\n");

  if (!logiPluginToolInstalled()) {
    if (!runStep("installing LogiPluginTool", "dotnet", ["tool", "install", "--global", "LogiPluginTool"])) {
      process.stdout.write("Haptic: LogiPluginTool install failed; finish manually:\n");
      process.stdout.write(`${MANUAL_STEPS}\n`);
      return;
    }
  }

  const built = runStep(
    "building plugin",
    "dotnet",
    ["build", "src/ClaudeHapticPlugin.csproj", "-c", "Release"],
    repoHapticPluginDir(),
  );
  if (!built) {
    process.stdout.write("Haptic: plugin build failed; see output above and the README.\n");
    return;
  }

  process.stdout.write(
    "Haptic: plugin built. Ensure Logitech Options+ is running and a Logitech MX Master 4 is connected.\n",
  );
}
