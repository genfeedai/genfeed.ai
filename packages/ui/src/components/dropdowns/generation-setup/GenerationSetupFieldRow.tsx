'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { GenerationSetupFieldRowProps } from '@genfeedai/props/ui/generation-setup/generation-setup.props';
import GenerationSetupFieldIcon from '@ui/dropdowns/generation-setup/GenerationSetupFieldIcon';
import { Button } from '@ui/primitives/button';
import { Undo2 } from 'lucide-react';

/**
 * One customize-tab row: label + provenance dot on the left, the field
 * control fixed-width on the right, with a reset affordance that only shows
 * once the field has left agent ownership. Structural port of
 * `StudioGenerateSettingsPopover.tsx`'s `SettingRow` widened with provenance.
 */
export default function GenerationSetupFieldRow({
  children,
  fieldKey,
  isResettable = true,
  label,
  onReset,
  reason,
  source,
}: GenerationSetupFieldRowProps) {
  const canReset = isResettable && source !== 'agent' && Boolean(onReset);

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <GenerationSetupFieldIcon
          fieldKey={fieldKey}
          reason={reason}
          source={source}
        />
        {label}
      </span>
      <div className="flex items-center gap-1">
        <div className="w-44 shrink-0">{children}</div>
        <span className="flex size-5 shrink-0 items-center justify-center">
          {canReset ? (
            <Button
              ariaLabel={`Reset ${label} to agent`}
              className="size-5 p-0 text-muted-foreground [&_svg]:size-3"
              icon={<Undo2 />}
              onClick={() => onReset?.(fieldKey)}
              size={ButtonSize.ICON}
              variant={ButtonVariant.GHOST}
            />
          ) : null}
        </span>
      </div>
    </div>
  );
}
