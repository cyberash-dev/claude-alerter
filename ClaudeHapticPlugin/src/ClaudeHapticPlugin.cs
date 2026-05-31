namespace Loupedeck.ClaudeHapticPlugin
{
    using System;
    using System.Collections.Generic;
    using System.IO;
    using System.Linq;
    using System.Threading;

    // Bridges claude-notifier hooks to MX Master 4 haptics. The Node side
    // drops a one-shot <uniq>.trigger file (content = trigger name) into
    // ~/.claude/notifier/haptic; this plugin watches that directory and
    // plays the matching haptic pattern.
    //
    // The Logi Actions SDK plays one waveform per RaiseEvent and offers no
    // native sequencing, so "complex" patterns are composed here as a timed
    // sequence of single-waveform events (a HapticStep list per Claude event).
    //
    // Trigger names:
    //   "<ClaudeEvent>"  e.g. "Stop"      -> plays Patterns["Stop"] as a sequence
    //   "wf:<waveform>"  e.g. "wf:jingle" -> plays one raw waveform (for tuning)

    public class ClaudeHapticPlugin : Plugin
    {
        // Waveforms referenced by the patterns below. Each is registered as an
        // event (so it can be sequenced and raised directly via a raw "wf:"
        // trigger); eventMapping.yaml maps each event name 1:1 to its waveform.
        // The SDK catalog has more (sharp_state_change, completed, jingle,
        // firework, mad, square, …) — add one here and in eventMapping.yaml to
        // use it in a pattern.
        private static readonly String[] Waveforms =
        {
            "wave", "happy_alert", "knock", "ringing",
        };

        // Melodies tuned on-device. delayMs is the pause AFTER the step before
        // the next waveform fires (the last step's delay is unused).
        private static readonly IReadOnlyDictionary<String, HapticStep[]> Patterns =
            new Dictionary<String, HapticStep[]>
            {
                ["Stop"] = new[]
                {
                    new HapticStep("wave", 260),
                    new HapticStep("happy_alert", 0),
                },
                ["Notification"] = new[]
                {
                    new HapticStep("knock", 220),
                    new HapticStep("ringing", 0),
                },
            };

        private FileSystemWatcher _watcher;

        public override Boolean UsesApplicationApiOnly => true;

        public override Boolean HasNoApplication => true;

        public ClaudeHapticPlugin()
        {
            PluginLog.Init(this.Log);
            PluginResources.Init(this.Assembly);
        }

        public override void Load()
        {
            foreach (var waveform in Waveforms)
            {
                this.PluginEvents.AddEvent(waveform, waveform, $"Haptic waveform: {waveform}");
            }

            this.StartTriggerWatcher();
        }

        public override void Unload()
        {
            this._watcher?.Dispose();
            this._watcher = null;
        }

        // Plays a trigger by name. Public so the manual TestBuzzCommand can reuse
        // the same dispatch as the file bridge.
        public void Trigger(String name)
        {
            if (String.IsNullOrEmpty(name))
            {
                return;
            }

            if (name.StartsWith("wf:", StringComparison.Ordinal))
            {
                var waveform = name.Substring(3);
                if (Waveforms.Contains(waveform))
                {
                    this.PluginEvents.RaiseEvent(waveform);
                }
                return;
            }

            if (Patterns.TryGetValue(name, out var steps))
            {
                this.PlayPattern(steps);
            }
        }

        // Plays the sequence off the caller's thread so neither the file watcher
        // nor the UI thread blocks on the inter-step sleeps.
        private void PlayPattern(HapticStep[] steps)
        {
            new Thread(() =>
            {
                foreach (var step in steps)
                {
                    try
                    {
                        this.PluginEvents.RaiseEvent(step.Waveform);
                    }
                    catch (Exception ex)
                    {
                        PluginLog.Warning($"Failed to raise waveform '{step.Waveform}': {ex.Message}");
                    }

                    if (step.DelayMs > 0)
                    {
                        Thread.Sleep(step.DelayMs);
                    }
                }
            })
            {
                IsBackground = true,
            }.Start();
        }

        private static String TriggerDir()
        {
            var configDir = Environment.GetEnvironmentVariable("CLAUDE_CONFIG_DIR");
            if (String.IsNullOrEmpty(configDir))
            {
                configDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".claude");
            }
            return Path.Combine(configDir, "notifier", "haptic");
        }

        private void StartTriggerWatcher()
        {
            var dir = TriggerDir();
            Directory.CreateDirectory(dir);

            // Drain triggers that arrived while the plugin was not running.
            foreach (var file in Directory.GetFiles(dir, "*.trigger"))
            {
                this.HandleTrigger(file);
            }

            this._watcher = new FileSystemWatcher(dir, "*.trigger")
            {
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite,
                EnableRaisingEvents = true,
            };
            this._watcher.Created += (sender, e) => this.HandleTrigger(e.FullPath);
        }

        private void HandleTrigger(String path)
        {
            try
            {
                this.Trigger(ReadTriggerName(path));
            }
            catch (Exception ex)
            {
                PluginLog.Warning($"Failed to handle haptic trigger '{path}': {ex.Message}");
            }
            finally
            {
                try
                {
                    File.Delete(path);
                }
                catch
                {
                    // Best-effort: a missing/locked file must not crash the watcher.
                }
            }
        }

        // The Created event can fire before the writer's bytes land, so read
        // with a short retry until the trigger name is readable.
        private static String ReadTriggerName(String path)
        {
            for (var attempt = 0; attempt < 10; attempt++)
            {
                try
                {
                    var text = File.ReadAllText(path).Trim();
                    if (text.Length > 0)
                    {
                        return text;
                    }
                }
                catch (IOException)
                {
                    // File still being written; back off and retry.
                }
                Thread.Sleep(20);
            }
            return null;
        }

        private readonly struct HapticStep
        {
            public HapticStep(String waveform, Int32 delayMs)
            {
                this.Waveform = waveform;
                this.DelayMs = delayMs;
            }

            public String Waveform { get; }

            public Int32 DelayMs { get; }
        }
    }
}
