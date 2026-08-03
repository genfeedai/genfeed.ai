import MetricCardCanonical from '@ui/cards/metric-card/MetricCard';
import type { ComponentType, ReactElement, ReactNode } from 'react';

type LegacyDashboardMetricCardProps = {
  description?: ReactNode;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  linkComponent?: ComponentType<{
    children: ReactNode;
    className: string;
    href: string;
    onClick?: () => void;
  }>;
  onClick?: () => void;
  value: string | number;
};

/**
 * @deprecated Prefer `@ui/cards/metric-card/MetricCard`.
 * Dashboard package alias — maps legacy icon-required API onto MetricCard.
 */
export function MetricCard({
  description,
  icon,
  label,
  value,
}: LegacyDashboardMetricCardProps): ReactElement {
  return (
    <MetricCardCanonical
      description={description}
      icon={icon}
      label={label}
      size="md"
      value={value}
    />
  );
}
