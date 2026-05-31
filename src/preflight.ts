import { audioPlayerAvailable, describePlayer } from "./sound";
import { describeFocus } from "./focus";
import { detectPackageManager, PackageManager } from "./system";

export interface InstallHint {
  what: string;
  command: string;
}

export interface Diagnostics {
  platform: typeof process.platform;
  audioAvailable: boolean;
  audioDetail: string;
  focusAvailable: boolean;
  focusReason: string;
  hints: InstallHint[];
}

interface ManagerCommands {
  audio: string;
  focusTools: string;
}

const MANAGER_COMMANDS: Record<PackageManager, ManagerCommands> = {
  apt: {
    audio: "sudo apt-get install -y alsa-utils",
    focusTools: "sudo apt-get install -y xdotool x11-utils",
  },
  dnf: {
    audio: "sudo dnf install -y alsa-utils",
    focusTools: "sudo dnf install -y xdotool xorg-x11-utils",
  },
  pacman: {
    audio: "sudo pacman -S --needed --noconfirm alsa-utils",
    focusTools: "sudo pacman -S --needed --noconfirm xdotool xorg-xprop",
  },
  zypper: {
    audio: "sudo zypper install -y alsa-utils",
    focusTools: "sudo zypper install -y xdotool xprop",
  },
  apk: {
    audio: "sudo apk add alsa-utils",
    focusTools: "sudo apk add xdotool xprop",
  },
};

export function linuxInstallCommands(pm: PackageManager): ManagerCommands {
  return MANAGER_COMMANDS[pm];
}

const AUDIO_FALLBACK = "install one of: paplay, aplay, ffplay, or play (sox)";
const FOCUS_FALLBACK = "install xdotool and xprop";

export function collectDiagnostics(): Diagnostics {
  const platform = process.platform;
  const audioAvailable = audioPlayerAvailable();
  const focus = describeFocus();

  const hints: InstallHint[] = [];
  if (platform === "linux") {
    const pm = detectPackageManager();
    const commands = pm === null ? null : MANAGER_COMMANDS[pm];
    if (!audioAvailable) {
      hints.push({ what: "audio player", command: commands?.audio ?? AUDIO_FALLBACK });
    }
    if (!focus.available && focus.reason.startsWith("X11")) {
      hints.push({ what: "X11 focus tools", command: commands?.focusTools ?? FOCUS_FALLBACK });
    }
  }

  return {
    platform,
    audioAvailable,
    audioDetail: describePlayer(),
    focusAvailable: focus.available,
    focusReason: focus.reason,
    hints,
  };
}

export function renderDiagnostics(d: Diagnostics): string {
  const lines: string[] = [];
  lines.push(`Platform: ${d.platform}`);
  lines.push(
    d.audioAvailable
      ? `Audio player: ${d.audioDetail}`
      : `Audio player: MISSING (tried paplay, aplay, ffplay, play)`,
  );
  lines.push(`Focus detection: ${d.focusAvailable ? "yes" : "no"} (${d.focusReason})`);
  if (d.hints.length > 0) {
    lines.push("");
    lines.push("Missing dependencies — install with:");
    for (const hint of d.hints) {
      lines.push(`  ${hint.what}: ${hint.command}`);
    }
  }
  return lines.join("\n");
}
