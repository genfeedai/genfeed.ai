import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import type { IconType } from 'react-icons';
import {
  HiOutlineArrowPath,
  HiOutlineInbox,
  HiOutlineSignalSlash,
} from 'react-icons/hi2';

export type DesktopResilienceKind = 'empty' | 'error' | 'offline';

interface DesktopResilienceStateProps {
  actionLabel?: string;
  className?: string;
  details: string;
  kind: DesktopResilienceKind;
  onAction?: () => void;
  title: string;
}

const RESILIENCE_ICON = {
  empty: HiOutlineInbox,
  error: HiOutlineArrowPath,
  offline: HiOutlineSignalSlash,
} satisfies Record<DesktopResilienceKind, IconType>;

export function DesktopResilienceState({
  actionLabel,
  className = '',
  details,
  kind,
  onAction,
  title,
}: DesktopResilienceStateProps): ReactElement {
  const Icon = RESILIENCE_ICON[kind];

  return (
    <section
      className={`desktop-resilience-state desktop-resilience-${kind} ${className}`.trim()}
      data-resilience-kind={kind}
    >
      <div className="desktop-resilience-icon" aria-hidden="true">
        <Icon className="desktop-resilience-icon-svg" />
      </div>
      <div className="desktop-resilience-copy">
        <h3>{title}</h3>
        <p>{details}</p>
      </div>
      {actionLabel && onAction ? (
        <Button
          className="desktop-resilience-action"
          icon={
            <HiOutlineArrowPath className="desktop-resilience-action-icon" />
          }
          onClick={onAction}
          type="button"
          variant={ButtonVariant.GHOST}
        >
          {actionLabel}
        </Button>
      ) : null}
    </section>
  );
}
