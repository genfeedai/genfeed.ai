'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import type { ReactNode } from 'react';

type PanelToggleProps = {
  readonly ariaControls: string;
  readonly ariaKeyShortcuts?: string;
  /** Overlaid on the icon, e.g. the unread dot. */
  readonly badge?: ReactNode;
  readonly icon: ReactNode;
  readonly isPressed: boolean;
  readonly label: string;
  readonly onToggle: () => void;
  readonly testId: string;
};

/**
 * One topbar control per side-panel view. It discloses the panel (`aria-expanded`)
 * and shows the view open; it is not a choice group.
 */
export default function PanelToggle({
  ariaControls,
  ariaKeyShortcuts,
  badge,
  icon,
  isPressed,
  label,
  onToggle,
  testId,
}: PanelToggleProps) {
  return (
    // ui-guard-allow:selection-button -- discloses a panel (aria-expanded) and shows it open; not a choice group
    <Button
      aria-controls={ariaControls}
      aria-expanded={isPressed}
      aria-keyshortcuts={ariaKeyShortcuts}
      ariaLabel={label}
      className="relative size-8"
      data-active={isPressed ? 'true' : 'false'}
      data-testid={testId}
      onClick={onToggle}
      size={ButtonSize.ICON}
      tooltip={label}
      type="button"
      variant={isPressed ? ButtonVariant.SECONDARY : ButtonVariant.GHOST}
      withWrapper={false}
    >
      {icon}
      {badge}
    </Button>
  );
}
