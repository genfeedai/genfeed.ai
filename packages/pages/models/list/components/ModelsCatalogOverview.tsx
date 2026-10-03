import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { TabItem } from '@genfeedai/props/ui/navigation/tabs.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Layers } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  ModelCatalogOverviewCard,
  ModelCategoryGroupKey,
} from './models-catalog-overview.helpers';

type ModelsCatalogOverviewProps = {
  cards: ModelCatalogOverviewCard[];
  isLoading: boolean;
  /** When set, the row filters the list; otherwise it is a read-only summary. */
  onSelect?: (key: ModelCategoryGroupKey | 'all') => void;
  selectedKey?: ModelCategoryGroupKey | null;
  total: number;
};

const ALL_KEY = 'all';

function CountBadge({ count }: { count: string }) {
  return (
    <span className="rounded bg-foreground/10 px-1.5 text-xs tabular-nums text-muted-foreground">
      {count}
    </span>
  );
}

/**
 * One-line category filter for the model catalog: every family with its count
 * on a single row (scrolls horizontally on narrow screens).
 */
export default function ModelsCatalogOverview({
  cards,
  isLoading,
  onSelect,
  selectedKey = null,
  total,
}: ModelsCatalogOverviewProps) {
  const translate = useTranslations('pages.models');
  const formatCount = (count: number) => (isLoading ? '–' : String(count));
  const items: TabItem[] = [
    {
      badge: <CountBadge count={formatCount(total)} />,
      icon: Layers,
      id: ALL_KEY,
      label: translate('categoryAll'),
    },
    ...cards.map((card) => ({
      badge: <CountBadge count={formatCount(card.count)} />,
      icon: card.icon,
      id: card.key,
      label: card.label,
    })),
  ];

  if (onSelect) {
    return (
      <div className="mb-4 overflow-x-auto pb-1">
        <Tabs
          activeTab={selectedKey ?? ALL_KEY}
          ariaLabel={translate('categoryFilterLabel')}
          className="ml-0 justify-start"
          items={items}
          listClassName="mr-auto"
          onTabChange={(id) =>
            onSelect(id === ALL_KEY ? ALL_KEY : (id as ModelCategoryGroupKey))
          }
          testId="models-category-filter"
        />
      </div>
    );
  }

  return (
    <div
      className="mb-4 flex gap-2 overflow-x-auto pb-1"
      data-testid="models-category-filter"
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className={cn(
              'flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm',
              !card.isActive && 'opacity-50',
            )}
            title={card.description}
          >
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded',
                card.iconClassName,
              )}
            >
              <Icon className="size-3" />
            </span>
            <span className="font-medium">{card.label}</span>
            <CountBadge count={formatCount(card.count)} />
          </div>
        );
      })}
    </div>
  );
}
