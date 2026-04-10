import { ButtonVariant } from '@genfeedai/enums';
import type { ComponentType, ReactNode } from 'react';
import { Button } from '../primitives/button';

interface MetricCardProps {
  icon: ComponentType<{ className?: string }>;
  value: string | number;
  label: string;
  description?: ReactNode;
  href?: string;
  onClick?: () => void;
  linkComponent?: ComponentType<{
    href: string;
    className: string;
    onClick?: () => void;
    children: ReactNode;
  }>;
}

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function MetricCard({
  icon: Icon,
  value,
  label,
  description,
  href,
  onClick,
  linkComponent: LinkComponent,
}: MetricCardProps) {
  const isClickable = !!(href || onClick);

  const inner = (
    <div
      className={cn(
        'h-full px-4 py-4 sm:px-5 sm:py-5 transition-colors',
        isClickable && 'hover:bg-accent/50 cursor-pointer',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
            {value}
          </p>
          <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">
            {label}
          </p>
          {description && (
            <div className="mt-1.5 hidden text-xs text-muted-foreground/70 sm:block">
              {description}
            </div>
          )}
        </div>
        <Icon className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
      </div>
    </div>
  );

  if (href && LinkComponent) {
    return (
      <LinkComponent
        href={href}
        className="h-full text-inherit no-underline"
        onClick={onClick}
      >
        {inner}
      </LinkComponent>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        className="h-full text-inherit no-underline"
        onClick={onClick}
      >
        {inner}
      </a>
    );
  }

  if (onClick) {
    return (
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        className="h-full w-full text-left"
        onClick={onClick}
      >
        {inner}
      </Button>
    );
  }

  return inner;
}
