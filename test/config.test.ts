import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadConfig, resolveSoundPath } from "../src/config";

function writeTempConfig(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csn-config-"));
  const file = path.join(dir, "config.json");
  fs.writeFileSync(file, content);
  return file;
}

const VALID = JSON.stringify({
  terminals: ["iTerm2"],
  default_interval: 15,
  max_repeats: 20,
  events: {
    Stop: { enabled: true, sound: "done.wav", interval: 10 },
  },
});

test("loadConfig accepts a well-formed config", () => {
  const file = writeTempConfig(VALID);

  const config = loadConfig(file);

  assert.equal(config.default_interval, 15);
  assert.equal(config.events.Stop.sound, "done.wav");
  assert.equal(config.events.Stop.interval, 10);
});

test("loadConfig rejects a non-positive default_interval", () => {
  const file = writeTempConfig(
    JSON.stringify({ terminals: [], default_interval: 0, max_repeats: 1, events: {} }),
  );

  assert.throws(() => loadConfig(file), /default_interval/);
});

test("loadConfig rejects an event missing enabled", () => {
  const file = writeTempConfig(
    JSON.stringify({
      terminals: [],
      default_interval: 15,
      max_repeats: 1,
      events: { Stop: { sound: "done.wav" } },
    }),
  );

  assert.throws(() => loadConfig(file), /Stop"\.enabled/);
});

test("loadConfig accepts an empty sound when haptic is enabled", () => {
  const file = writeTempConfig(
    JSON.stringify({
      terminals: [],
      default_interval: 15,
      max_repeats: 1,
      events: { Stop: { enabled: true, sound: "", haptic: true } },
    }),
  );

  const config = loadConfig(file);

  assert.equal(config.events.Stop.sound, "");
  assert.equal(config.events.Stop.haptic, true);
});

test("loadConfig rejects an enabled event with empty sound and no haptic", () => {
  const file = writeTempConfig(
    JSON.stringify({
      terminals: [],
      default_interval: 15,
      max_repeats: 1,
      events: { Stop: { enabled: true, sound: "" } },
    }),
  );

  assert.throws(() => loadConfig(file), /Stop".*neither sound nor haptic/);
});

test("loadConfig rejects an enabled event with empty sound and haptic disabled", () => {
  const file = writeTempConfig(
    JSON.stringify({
      terminals: [],
      default_interval: 15,
      max_repeats: 1,
      events: { Stop: { enabled: true, sound: "", haptic: false } },
    }),
  );

  assert.throws(() => loadConfig(file), /Stop".*neither sound nor haptic/);
});

test("loadConfig rejects a missing config file", () => {
  assert.throws(() => loadConfig("/no/such/config.json"), /config file not found/);
});

test("resolveSoundPath returns an absolute path unchanged", () => {
  const absolute = path.join(path.sep, "tmp", "custom.wav");

  assert.equal(resolveSoundPath(absolute), absolute);
});

test("resolveSoundPath joins a bare name onto the bundled sounds dir", () => {
  const resolved = resolveSoundPath("done.wav");

  assert.ok(path.isAbsolute(resolved));
  assert.equal(path.basename(resolved), "done.wav");
});
