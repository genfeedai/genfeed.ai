import { CardVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { StatsCardsProps } from '@props/ui/cards/stats-cards.props';
import Card from '@ui/card/Card';

const GRID_COLS_CLASSES: Record<number, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
};

function getGridColsClass(count: number): string {
  return GRID_COLS_CLASSES[count] ?? 'md:grid-cols-4';
}

export default function StatsCards({
  items,
  className,
  isLoading = false,
}: StatsCardsProps) {
  if (isLoading) {
    return (
      <div
        className={cn('grid grid-cols-1 md:grid-cols-4 gap-4 mb-6', className)}
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={`loading-${index}`} index={index} bodyClassName="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-muted animate-pulse w-12 h-12" />
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-muted animate-pulse w-24" />
                <div className="h-4 bg-muted animate-pulse w-32" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return null;
  }

  const gridColsClass = getGridColsClass(items.length);

  return (
    <div
      className={cn('grid grid-cols-1 gap-4 mb-6', gridColsClass, className)}
    >
      {items.map((stat, index) => {
        const description =
          stat.description ||
          `${stat.count} ${stat.count === 1 && stat.singularLabel ? stat.singularLabel : stat.label.toLowerCase()}`;

        return (
          <Card
            key={stat.label}
            index={index}
            variant={CardVariant.DEFAULT}
            label={stat.label}
            description={description}
            icon={stat.icon}
            iconWrapperClassName={cn('p-3', stat.colorClass)}
            bodyClassName="p-4"
            className={stat.cardClassName}
          />
        );
      })}
    </div>
  );
}
