namespace Loupedeck.ClaudeHapticPlugin
{
    using System;

    // A manual trigger for the haptic pulse, so the device feedback can be
    // verified from Logi Options+ without going through the file-trigger bridge.

    public class TestBuzzCommand : PluginDynamicCommand
    {
        public TestBuzzCommand()
            : base(displayName: "Test Haptic Pattern", description: "Plays the Stop haptic pattern", groupName: "Commands")
        {
        }

        protected override void RunCommand(String actionParameter) =>
            ((ClaudeHapticPlugin)this.Plugin).Trigger("Stop");
    }
}
