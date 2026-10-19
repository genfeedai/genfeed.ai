import type { IOrganization } from '@genfeedai/contracts/interfaces';
import type { Preset } from '@models/elements/preset.model';
import Badge from '@ui/display/badge/Badge';

export function PresetLabelCell({ preset }: { preset: Preset }) {
  return (
    <div className="max-w-40 overflow-hidden break-words whitespace-pre-line line-clamp-1">
      {preset.label || '-'}
    </div>
  );
}

/**
 * A preset with no organization is a platform preset every organization loads.
 * The list does not populate the organization, so ownership reads off the
 * scalar `organizationId`.
 */
export function PresetOrganizationCell({ preset }: { preset: Preset }) {
  const organization = preset.organization as IOrganization | undefined;
  const isSystemPreset = !preset.organizationId;

  return (
    <Badge
      className={`text-xs border border-border bg-transparent uppercase ${
        isSystemPreset ? 'text-muted-foreground' : 'text-primary'
      }`}
    >
      {isSystemPreset ? 'System' : organization?.label || 'Organization'}
    </Badge>
  );
}

export function PresetKeyCell({ preset }: { preset: Preset }) {
  return <span className="font-mono text-sm">{preset.key || '-'}</span>;
}

export function PresetCategoryCell({ preset }: { preset: Preset }) {
  if (!preset.category) {
    return '-';
  }

  return (
    <Badge className="text-xs border border-border bg-transparent uppercase">
      {preset.category}
    </Badge>
  );
}

/** The settings an operator scans for; the edit modal shows the full recipe. */
export function PresetDefaultsCell({ preset }: { preset: Preset }) {
  const defaults = [
    preset.aspectRatio ? `Aspect: ${preset.aspectRatio}` : null,
    typeof preset.duration === 'number'
      ? `Duration: ${preset.duration}s`
      : null,
    preset.style ? `Style: ${preset.style}` : null,
  ].filter((value): value is string => value !== null);

  return defaults.length > 0 ? (
    <div className="flex max-w-56 flex-col items-start gap-2 text-xs">
      {defaults.map((def) => (
        <Badge
          key={def}
          className="max-w-full overflow-hidden text-2xs border border-border bg-transparent font-mono"
        >
          <span className="truncate" title={def}>
            {def}
          </span>
        </Badge>
      ))}
    </div>
  ) : (
    '-'
  );
}
