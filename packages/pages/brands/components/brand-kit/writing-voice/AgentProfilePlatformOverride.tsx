'use client';

import type { AgentProfilePlatformOverrideProps } from '@props/pages/brand-detail.props';
import AgentProfilePlatformOverrideFields from './AgentProfilePlatformOverrideFields';
import AgentProfilePlatformOverrideWideFields from './AgentProfilePlatformOverrideWideFields';

export default function AgentProfilePlatformOverride({
  enabledModelIds,
  isDisabled,
  label,
  onSave,
  onSelectChange,
  override,
  platformValue,
  showHeader = true,
}: AgentProfilePlatformOverrideProps) {
  return (
    <div className="space-y-4 rounded-lg bg-background-secondary p-4 shadow-border">
      {showHeader ? (
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-medium">{label}</h4>
          <span className="text-xs text-muted-foreground">
            Optional override
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <AgentProfilePlatformOverrideFields
          enabledModelIds={enabledModelIds}
          isDisabled={isDisabled}
          onSave={onSave}
          onSelectChange={onSelectChange}
          override={override}
          platformValue={platformValue}
        />
        <AgentProfilePlatformOverrideWideFields
          isDisabled={isDisabled}
          onSave={onSave}
          override={override}
          platformValue={platformValue}
        />
      </div>
    </div>
  );
}
