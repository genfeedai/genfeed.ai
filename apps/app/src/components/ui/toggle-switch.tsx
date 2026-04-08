import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Override the active color (defaults to bg-primary) */
  activeColor?: string;
  className?: string;
}

const ToggleSwitch = forwardRef<HTMLButtonElement, ToggleSwitchProps>(
  (
    { checked, onCheckedChange, activeColor = 'bg-primary', className },
    ref,
  ) => (
    <Button
      ref={ref}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors',
        checked ? activeColor : 'bg-border',
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </Button>
  ),
);
ToggleSwitch.displayName = 'ToggleSwitch';

export { ToggleSwitch };
