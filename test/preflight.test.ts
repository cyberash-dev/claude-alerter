import { test } from "node:test";
import * as assert from "node:assert/strict";
import { collectDiagnostics, linuxInstallCommands } from "../src/preflight";
import { PackageManager } from "../src/system";

const CASES: ReadonlyArray<[PackageManager, string, string]> = [
  ["apt", "apt-get install", "xdotool"],
  ["dnf", "dnf install", "xdotool"],
  ["pacman", "pacman -S", "xdotool"],
  ["zypper", "zypper install", "xdotool"],
  ["apk", "apk add", "xdotool"],
];

for (const [pm, audioFragment, focusFragment] of CASES) {
  test(`linuxInstallCommands(${pm}) names the package manager and focus tools`, () => {
    const commands = linuxInstallCommands(pm);

    assert.ok(commands.audio.includes(audioFragment), commands.audio);
    assert.ok(commands.focusTools.includes(focusFragment), commands.focusTools);
  });
}

test("collectDiagnostics reports the running platform", () => {
  const diagnostics = collectDiagnostics();

  assert.equal(diagnostics.platform, process.platform);
});

test("collectDiagnostics emits no install hints off Linux", () => {
  if (process.platform === "linux") {
    return;
  }

  const diagnostics = collectDiagnostics();

  assert.equal(diagnostics.hints.length, 0);
  assert.equal(diagnostics.audioAvailable, true);
});
