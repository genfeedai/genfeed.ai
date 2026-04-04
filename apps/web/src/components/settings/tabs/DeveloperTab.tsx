'use client';

import { InfoBox, SettingsField } from '@/components/ui/settings-section';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useSettingsStore } from '@/store/settingsStore';
import { AlertTriangle, Bug, Code } from 'lucide-react';

export function DeveloperTab() {
  const { debugMode, setDebugMode } = useSettingsStore();

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Developer tools for debugging and testing workflows.
      </p>

      <div className="space-y-4">
        <SettingsField
          label="Debug Mode"
          icon={Bug}
          description="Skip API calls and inspect payloads without paying for generations"
          action={
            <ToggleSwitch
              checked={debugMode}
              onCheckedChange={setDebugMode}
              activeColor="bg-amber-500"
            />
          }
        />

        {debugMode && (
          <InfoBox variant="warning" icon={AlertTriangle} title="Debug mode is active">
            Use <strong>&quot;Run Selected&quot;</strong> to test nodes with mocked API calls. Full
            workflow execution (&quot;Run Workflow&quot;) will still make real API calls.
          </InfoBox>
        )}
      </div>

      <InfoBox icon={Code} title="What debug mode does">
        <ul className="text-xs text-muted-foreground space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">&#8226;</span>
            <span>Skips actual Replicate API calls to avoid charges</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">&#8226;</span>
            <span>Returns placeholder images/videos with &quot;DEBUG&quot; watermark</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">&#8226;</span>
            <span>Opens debug panel showing exact payloads that would be sent</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary mt-0.5">&#8226;</span>
            <span>Works with &quot;Run Selected&quot; for testing individual nodes</span>
          </li>
        </ul>
      </InfoBox>
    </div>
  );
}
