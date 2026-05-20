import { spawnSync } from "child_process";

function run(cmd: string, args: string[]): string | null {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.status !== 0 || typeof result.stdout !== "string") {
    return null;
  }
  const text = result.stdout.trim();
  return text.length > 0 ? text : null;
}

const WIN_FOCUS_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
}
"@
$pidOut = 0
$null = [Win]::GetWindowThreadProcessId([Win]::GetForegroundWindow(), [ref]$pidOut)
(Get-Process -Id $pidOut).ProcessName
`.trim();

export function frontmostName(): string | null {
  if (process.platform === "darwin") {
    return run("osascript", [
      "-e",
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ]);
  }

  if (process.platform === "win32") {
    return run("powershell", ["-NoProfile", "-NonInteractive", "-Command", WIN_FOCUS_SCRIPT]);
  }

  const isWayland: boolean =
    (process.env.WAYLAND_DISPLAY ?? "").length > 0 ||
    (process.env.XDG_SESSION_TYPE ?? "").toLowerCase() === "wayland";
  if (isWayland) {
    return null;
  }

  const winId = run("xdotool", ["getactivewindow"]);
  if (winId === null) {
    return null;
  }
  const wmClass = run("xprop", ["-id", winId, "WM_CLASS"]);
  if (wmClass !== null) {
    return wmClass;
  }
  return run("xdotool", ["getactivewindow", "getwindowname"]);
}

export function isTerminalFocused(terminals: string[]): boolean {
  const front = frontmostName();
  if (front === null) {
    return false;
  }
  const haystack = front.toLowerCase();
  return terminals.some((t) => haystack.includes(t.toLowerCase()));
}

export function focusDetectionAvailable(): boolean {
  if (process.platform === "darwin" || process.platform === "win32") {
    return true;
  }
  const isWayland: boolean =
    (process.env.WAYLAND_DISPLAY ?? "").length > 0 ||
    (process.env.XDG_SESSION_TYPE ?? "").toLowerCase() === "wayland";
  return !isWayland;
}
