'use client';

import type { ContentTeamRolePreset } from '@pages/agents/content-team/content-team-presets';
import Card from '@ui/card/Card';

interface RolePreviewCardProps {
  budget: string;
  selectedPreset: ContentTeamRolePreset | undefined;
  teamGroup: string;
}

export function RolePreviewCard({
  budget,
  selectedPreset,
  teamGroup,
}: RolePreviewCardProps) {
  return (
    <Card
      bodyClassName="space-y-4 p-5"
      description={selectedPreset?.description}
      label={selectedPreset?.displayRole ?? 'Role Preview'}
    >
      <div className="grid grid-cols-1 gap-3 text-sm">
        <div>
          <p className="text-foreground/45">Agent Type</p>
          <p className="mt-1 font-medium text-foreground">
            {selectedPreset?.type ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-foreground/45">Default Platforms</p>
          <p className="mt-1 font-medium text-foreground">
            {selectedPreset?.platforms.join(', ') ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-foreground/45">Suggested Team Group</p>
          <p className="mt-1 font-medium text-foreground">
            {teamGroup || selectedPreset?.teamGroup || '—'}
          </p>
        </div>
        <div>
          <p className="text-foreground/45">Suggested Budget</p>
          <p className="mt-1 font-medium text-foreground">
            {budget || selectedPreset?.defaultBudget || 0} credits / day
          </p>
        </div>
      </div>
    </Card>
  );
}
