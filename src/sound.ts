import { spawnSync } from "child_process";

type Player = { cmd: string; args: (file: string) => string[] };

function commandExists(cmd: string): boolean {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [cmd] : ["-v", cmd];
  const result = spawnSync(probe, args, { stdio: "ignore", shell: process.platform === "win32" });
  return result.status === 0;
}

const LINUX_PLAYERS: Player[] = [
  { cmd: "paplay", args: (f) => [f] },
  { cmd: "aplay", args: (f) => ["-q", f] },
  { cmd: "ffplay", args: (f) => ["-nodisp", "-autoexit", "-loglevel", "quiet", f] },
  { cmd: "play", args: (f) => ["-q", f] },
];

function pickLinuxPlayer(): Player | null {
  for (const player of LINUX_PLAYERS) {
    if (commandExists(player.cmd)) {
      return player;
    }
  }
  return null;
}

export function playSound(file: string): void {
  if (process.platform === "darwin") {
    spawnSync("afplay", [file], { stdio: "ignore" });
    return;
  }

  if (process.platform === "win32") {
    const escaped = file.replace(/'/g, "''");
    const script = `(New-Object Media.SoundPlayer '${escaped}').PlaySync()`;
    spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "ignore",
    });
    return;
  }

  const player = pickLinuxPlayer();
  if (player === null) {
    process.stderr.write(
      "[claude-sound-notify] no audio player found (tried paplay, aplay, ffplay, play)\n",
    );
    return;
  }
  spawnSync(player.cmd, player.args(file), { stdio: "ignore" });
}

export function describePlayer(): string {
  if (process.platform === "darwin") {
    return "afplay";
  }
  if (process.platform === "win32") {
    return "powershell Media.SoundPlayer";
  }
  const player = pickLinuxPlayer();
  return player === null ? "none available" : player.cmd;
}
