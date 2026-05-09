import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { Ref } from 'react';
import { cn } from '@/lib/utils';

interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Override the active color (defaults to bg-primary) */
  activeColor?: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

function ToggleSwitch({
  activeColor = 'bg-primary',
  checked,
  className,
  onCheckedChange,
  ref,
}: ToggleSwitchProps) {
  return (
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
  );
}

export { ToggleSwitch };
