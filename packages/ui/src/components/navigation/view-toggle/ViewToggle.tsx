'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { ViewToggleProps } from '@props/ui/navigation/view-toggle.props';
import { Button } from '@ui/primitives/button';

/** Tab-style component for switching between view types. See Storybook for examples. */
export default function ViewToggle({
  options,
  activeView,
  onChange,
  className,
}: ViewToggleProps) {
  return (
    <div className={cn('inline-flex', className)}>
      {options.map((option) => {
        const isActive = activeView === option.type;

        return (
          <Button
            key={option.type}
            icon={option.icon}
            variant={ButtonVariant.GHOST}
            className={cn(
              isActive
                ? 'bg-white/10 text-foreground hover:bg-white/15'
                : 'text-foreground/70 hover:text-foreground',
              'rounded-lg',
            )}
            tooltip={option.label}
            ariaLabel={option.ariaLabel || option.label}
            onClick={() => onChange(option.type)}
          />
        );
      })}
    </div>
  );
}
