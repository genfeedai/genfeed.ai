'use client';

import { AlertCategory } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { KPISectionProps } from '@props/ui/kpi/kpi-section.props';
import Alert from '@ui/feedback/alert/Alert';
import KPICard from '@ui/kpi/kpi-card/KPICard';

// Static Tailwind grid class mappings (must be static for Tailwind JIT)
const MOBILE_GRID_CLASSES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

const TABLET_GRID_CLASSES: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
};

const DESKTOP_GRID_CLASSES: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

interface SectionHeaderProps {
  title: string;
  headerActions?: React.ReactNode;
}

function SectionHeader({
  title,
  headerActions,
}: SectionHeaderProps): React.ReactNode {
  return (
    <div className="flex justify-between items-center mb-4">
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
  const mobile = gridCols.mobile ?? 1;
  const tablet = gridCols.tablet ?? 2;
  const desktop = gridCols.desktop ?? 3;

  const gridColsClass = cn(
    'grid gap-4',
    MOBILE_GRID_CLASSES[mobile] || 'grid-cols-1',
    TABLET_GRID_CLASSES[tablet] || 'md:grid-cols-2',
    DESKTOP_GRID_CLASSES[desktop] || 'lg:grid-cols-3',
  );

  const renderContent = (): React.ReactNode => {
    if (error) {
      return <Alert type={AlertCategory.ERROR}>{error}</Alert>;
    }

    return (
      <div className={gridColsClass}>
        {items.map((item, index) => (
          <KPICard key={index} {...item} isLoading={isLoading} />
        ))}
      </div>
    );
  };

  return (
    <div className={cn('mb-6', className)}>
      {title && <SectionHeader title={title} headerActions={headerActions} />}

      {renderContent()}
    </div>
  );
}
