import { ButtonVariant } from '@genfeedai/enums';
import type { IconType } from '@genfeedai/interfaces/ui/icon.interface';
import { Button } from '@ui/primitives/button';
import { Inbox, RefreshCw, SignalZero } from 'lucide-react';
import type { ReactElement } from 'react';

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
  empty: Inbox,
  error: RefreshCw,
  offline: SignalZero,
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
          icon={<RefreshCw className="desktop-resilience-action-icon" />}
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
