'use client';

import { Switch } from '@ui/primitives/switch';

export interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Reusable toggle switch component
 * Extracted from repeated inline toggle patterns across node components
 */
export default function Toggle({
  checked,
  onChange,
  disabled = false,
  size = 'sm',
  className,
}: ToggleProps): React.JSX.Element {
  return (
    <Switch
      checked={checked}
      className={className}
      isDisabled={disabled}
      onCheckedChange={() => onChange()}
      size={size}
    />
  );
}
