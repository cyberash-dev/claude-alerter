import { test } from "node:test";
import * as assert from "node:assert/strict";
import { computeSettings } from "../src/settings";
import { Config } from "../src/config";

function configWith(events: Config["events"]): Config {
  return { terminals: ["iTerm2"], default_interval: 15, max_repeats: 20, events };
}

test("computeSettings adds a hook for each enabled event plus the stop hook", () => {
  const config = configWith({ Stop: { enabled: true, sound: "done.wav" } });

  const settings = computeSettings({}, config);

  assert.ok(settings.hooks?.Stop);
  assert.ok(settings.hooks?.UserPromptSubmit);
});

test("computeSettings omits disabled events", () => {
  const config = configWith({ Stop: { enabled: false, sound: "done.wav" } });

  const settings = computeSettings({}, config);

  assert.equal(settings.hooks?.Stop, undefined);
});

test("computeSettings is idempotent over its own output", () => {
  const config = configWith({ Stop: { enabled: true, sound: "done.wav" } });

  const once = computeSettings({}, config);
  const twice = computeSettings(once, config);

  assert.deepEqual(twice, once);
});

test("computeSettings preserves foreign hooks", () => {
  const config = configWith({ Stop: { enabled: true, sound: "done.wav" } });
  const foreign = {
    hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "/usr/bin/other" }] }] },
  };

  const settings = computeSettings(foreign, config);

  assert.ok(settings.hooks?.PreToolUse);
});

test("computeSettings quotes the node and cli paths in the hook command", () => {
  const config = configWith({ Stop: { enabled: true, sound: "done.wav" } });

  const settings = computeSettings({}, config);
  const command = settings.hooks?.Stop?.[0]?.hooks?.[0]?.command ?? "";

  assert.match(command, /^"[^"]+" "[^"]+" play Stop$/);
});

test("computeSettings strips legacy sound-notify hooks left by the old name", () => {
  const config = configWith({ Stop: { enabled: true, sound: "done.wav" } });
  const legacy = {
    hooks: {
      Stop: [
        { hooks: [{ type: "command", command: '"node" "/home/u/.claude/sound-notify/cli.js" play Stop' }] },
      ],
    },
  };

  const settings = computeSettings(legacy, config);
  const commands = (settings.hooks?.Stop ?? []).flatMap((group) =>
    group.hooks.map((entry) => entry.command ?? ""),
  );

  assert.equal(commands.filter((command) => command.includes("sound-notify")).length, 0);
});
