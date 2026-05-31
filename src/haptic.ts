import * as fs from "fs";
import * as path from "path";
import { hapticTriggerDir } from "./paths";

// Drops a one-shot trigger file the C# Logi plugin watches for. The plugin
// reads the event name, fires a haptic pulse via RaiseEvent, then deletes the
// file. Best-effort by contract: a missing plugin, unwritable dir, or any IO
// error must never break the hook (golden rule #5) — the sound channel still
// works on its own.
export function triggerHaptic(eventName: string): void {
  // Logitech Options+ has no Linux build, so a trigger file there would never be
  // consumed and would accumulate. Skip writing it entirely on Linux.
  if (process.platform === "linux") {
    return;
  }
  try {
    const dir = hapticTriggerDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${process.pid}-${process.hrtime.bigint()}.trigger`);
    fs.writeFileSync(file, eventName);
  } catch {
    // Haptic is a secondary channel; never surface its failures.
  }
}
