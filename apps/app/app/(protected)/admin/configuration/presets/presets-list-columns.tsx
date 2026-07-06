'use client';

import type { IOrganization } from '@genfeedai/interfaces';
import type { Preset } from '@models/elements/preset.model';
import Badge from '@ui/display/badge/Badge';

export function PresetLabelCell({ preset }: { preset: Preset }) {
  return (
    <div className="max-w-40 overflow-hidden break-words whitespace-pre-line line-clamp-1">
      {preset.label || '-'}
    </div>
  );
}

export function PresetDescriptionCell({ preset }: { preset: Preset }) {
  return (
    <div className="max-w-40 overflow-hidden break-words whitespace-pre-line line-clamp-2">
      {preset.description || '-'}
    </div>
  );
}

export function PresetOrganizationCell({ preset }: { preset: Preset }) {
  const organization = preset.organization as IOrganization;
  const orgLabel = organization.label || 'Genfeed.ai';
  const isOrgPreset = !!organization.label;

  return (
    <Badge
      className={`text-xs border border-white/[0.08] bg-transparent uppercase ${
        isOrgPreset ? 'text-primary' : 'text-muted-foreground'
      }`}
    >
      {orgLabel}
    </Badge>
  );
}

export function PresetCategoryCell({ preset }: { preset: Preset }) {
  return (
    <Badge className="text-xs border border-white/[0.08] bg-transparent uppercase">
      {preset.category}
    </Badge>
  );
}

export function PresetDefaultsCell({ preset }: { preset: Preset }) {
  const defaults = [];
  if (preset.defaultCamera) {
    defaults.push(`Camera: ${preset.defaultCamera}`);
  }
  if (preset.defaultScene) {
    defaults.push(`Scene: ${preset.defaultScene}`);
  }
  if (preset.defaultStyle) {
    defaults.push(`Style: ${preset.defaultStyle}`);
  }
  if (preset.defaultMoods?.length) {
    defaults.push(`Moods: ${preset.defaultMoods.join(', ')}`);
  }
  if (preset.defaultBlacklists?.length) {
    defaults.push(`Blacklists: ${preset.defaultBlacklists.join(', ')}`);
  }

  return defaults.length > 0 ? (
    <div className="flex flex-col gap-2 text-xs">
      {defaults.map((def) => (
        <Badge
          key={def}
          className="text-[10px] border border-white/[0.08] bg-transparent font-mono"
        >
          {def}
        </Badge>
      ))}
    </div>
  ) : (
    '-'
  );
}
