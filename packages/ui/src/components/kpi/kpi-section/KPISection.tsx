'use client';

import { AlertCategory } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { KPISectionProps } from '@genfeedai/props/ui/kpi/kpi-section.props';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import {
  MetricCardGrid,
  type MetricCardGridProps,
} from '@ui/cards/metric-card/MetricCardGrid';
import Alert from '@ui/feedback/alert/Alert';

interface SectionHeaderProps {
  title: string;
  headerActions?: React.ReactNode;
}

function SectionHeader({
  title,
  headerActions,
}: SectionHeaderProps): React.ReactNode {
  return (
    <div className="mb-4 flex min-w-0 flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
        {title}
      </h2>
      {headerActions}
    </div>
  );
}

export default function KPISection({
  title,
  items,
  isLoading = false,
  error = null,
  headerActions,
  gridCols = { desktop: 3, mobile: 1, tablet: 2 },
  className,
}: KPISectionProps) {
  const columns = Math.max(
    1,
    Math.min(6, gridCols.desktop ?? 3),
  ) as MetricCardGridProps['columns'];

  const sectionContent: React.ReactNode = error ? (
    <Alert type={AlertCategory.ERROR}>{error}</Alert>
  ) : (
    <MetricCardGrid columns={columns}>
      {items.map((item) => (
        <MetricCard
          key={item.label}
          className={item.className}
          description={item.description}
          icon={item.icon}
          iconClassName={item.iconClassName}
          isLoading={isLoading}
          label={item.label}
          size="lg"
          trend={item.trend}
          trendLabel={item.trendLabel}
          value={item.value}
          valueClassName={item.valueClassName}
        />
      ))}
    </MetricCardGrid>
  );

  return (
    <div className={cn('mb-6', className)}>
      {title && <SectionHeader title={title} headerActions={headerActions} />}

      {sectionContent}
    </div>
  );
}
