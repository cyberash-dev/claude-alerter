import { spawnSync } from "child_process";
import * as fs from "fs";

export type PackageManager = "apt" | "dnf" | "pacman" | "zypper" | "apk";

export function commandExists(cmd: string): boolean {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [cmd] : ["-v", cmd];
  const result = spawnSync(probe, args, { stdio: "ignore", shell: process.platform === "win32" });
  return result.status === 0;
}

export interface OsRelease {
  id: string | null;
  idLike: string | null;
}

export function readOsRelease(): OsRelease {
  if (process.platform !== "linux") {
    return { id: null, idLike: null };
  }
  let text: string;
  try {
    text = fs.readFileSync("/etc/os-release", "utf8");
  } catch {
    return { id: null, idLike: null };
  }
  const fields = new Map<string, string>();
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    fields.set(key, value);
  }
  return { id: fields.get("ID") ?? null, idLike: fields.get("ID_LIKE") ?? null };
}

const FAMILY_MANAGER: Record<string, PackageManager> = {
  debian: "apt",
  ubuntu: "apt",
  fedora: "dnf",
  rhel: "dnf",
  centos: "dnf",
  arch: "pacman",
  suse: "zypper",
  opensuse: "zypper",
  alpine: "apk",
};

function managerFromRelease(release: OsRelease): PackageManager | null {
  const tokens = [release.id ?? "", ...(release.idLike ?? "").split(/\s+/)]
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0);
  for (const token of tokens) {
    const manager = FAMILY_MANAGER[token];
    if (manager !== undefined) {
      return manager;
    }
  }
  return null;
}

const MANAGER_BINARY: ReadonlyArray<[PackageManager, string]> = [
  ["apt", "apt-get"],
  ["dnf", "dnf"],
  ["pacman", "pacman"],
  ["zypper", "zypper"],
  ["apk", "apk"],
];

export function detectPackageManager(): PackageManager | null {
  const fromRelease = managerFromRelease(readOsRelease());
  if (fromRelease !== null) {
    return fromRelease;
  }
  for (const [manager, binary] of MANAGER_BINARY) {
    if (commandExists(binary)) {
      return manager;
    }
  }
  return null;
}
