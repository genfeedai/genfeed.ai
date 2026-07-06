'use client';

import AgentProfilePlatformOverrideFields from './AgentProfilePlatformOverrideFields';
import AgentProfilePlatformOverrideWideFields from './AgentProfilePlatformOverrideWideFields';

type PlatformOverrideFormState = {
  approvedHooks: string;
  contentTypes: string;
  defaultModel: string;
  bannedPhrases: string;
  canonicalSource: 'brand' | 'founder' | 'hybrid' | '';
  doNotSoundLike: string;
  exemplarTexts: string;
  frequency: string;
  goals: string;
  messagingPillars: string;
  persona: string;
  sampleOutput: string;
  style: string;
  tone: string;
  audience: string;
  values: string;
  writingRules: string;
};

type AgentProfilePlatformOverrideProps = {
  enabledModels: string[];
  label: string;
  override: PlatformOverrideFormState;
  platformValue: string;
  onChange: (
    platform: string,
    key: keyof PlatformOverrideFormState,
    value: string,
  ) => void;
};

export default function AgentProfilePlatformOverride({
  enabledModels,
  label,
  override,
  platformValue,
  onChange,
}: AgentProfilePlatformOverrideProps) {
  return (
    <div className="space-y-4 rounded-lg bg-background-secondary p-4 shadow-border">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium">{label}</h4>
        <span className="text-xs text-muted-foreground">Optional override</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AgentProfilePlatformOverrideFields
          enabledModels={enabledModels}
          override={override}
          platformValue={platformValue}
          onChange={onChange}
        />
        <AgentProfilePlatformOverrideWideFields
          override={override}
          platformValue={platformValue}
          onChange={onChange}
        />
      </div>
    </div>
  );
}
