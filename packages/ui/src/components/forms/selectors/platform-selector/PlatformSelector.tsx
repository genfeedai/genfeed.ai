'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { PlatformSelectorProps } from '@props/forms/platform-selector.props';
import { Button } from '@ui/primitives/button';

/**
 * PlatformSelector - Radio group with platform icons
 *
 * Visual radio selector showing platform icons with handles.
 * User can select one platform account (single selection).
 *
 * @example
 * ```tsx
 * <PlatformSelector
 *   credentials={credentials}
 *   selectedCredentialId={selectedId}
 *   onSelect={(id) => setSelectedId(id)}
 * />
 * ```
 */
export default function PlatformSelector({
  credentials,
  selectedCredentialId,
  onSelect,
  isDisabled = false,
  className = '',
}: PlatformSelectorProps) {
  if (!credentials || credentials.length === 0) {
    return (
      <div className="text-center py-4 text-foreground/60 text-sm">
        No platform accounts available
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-wrap gap-2',
        isDisabled && 'opacity-50 pointer-events-none',
        className,
      )}
      role="radiogroup"
      aria-label="Select platform account"
    >
      {credentials.map((credential) => {
        const isSelected = credential.id === selectedCredentialId;
        const platformIcon = getPlatformIcon(credential.platform, 'w-4 h-4');
        const displayLabel = credential.label || credential.externalHandle;

        return (
          <Button
            key={credential.id}
            type="button"
            onClick={() => onSelect(credential.id)}
            isDisabled={isDisabled}
            variant={ButtonVariant.UNSTYLED}
            className={cn(
              'flex items-center gap-2 px-3 py-2 border border-white/[0.08] transition-all min-w-0',
              'hover:bg-background/50 focus:outline-none focus:ring-1 focus:ring-primary gap-2',
              isSelected ? 'bg-foreground/10 border-foreground/20' : 'bg-card',
              !isDisabled && 'cursor-pointer',
            )}
          >
            {/* Platform Icon */}
            <div className="flex-shrink-0">{platformIcon}</div>

            {/* Handle/Label */}
            {displayLabel && (
              <div className="text-sm text-foreground/70 truncate max-w-32">
                {displayLabel}
              </div>
            )}
          </Button>
        );
      })}
    </div>
  );
}
