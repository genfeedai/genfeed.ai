'use client';

import { LibraryShelf, PageScope } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createLibraryShelfRoute,
} from '@genfeedai/contracts/constants';
import type { OverviewCard } from '@genfeedai/contracts/interfaces/ui/overview-card.interface';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { formatIngredientFileSize } from '@utils/media/ingredient-ledger.util';
import {
  ClipboardCheck,
  Clock,
  Library,
  ScanFace,
  Star,
  TriangleAlert,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import OverviewLayout from '@/components/overview/OverviewLayout';
import { useLibrarySummary } from '@/features/library/hooks/use-library-summary';
import type { LibraryOverviewProps } from '@/features/library/props/library-overview.props';

const RECENT_ROUTE = APP_ROUTES.LIBRARY.RECENT;
const STARRED_ROUTE = APP_ROUTES.LIBRARY.STARRED;

/**
 * #5502 Library home: what needs attention and where to jump in. Every count
 * links into Assets with the matching filter, so the Overview never becomes a
 * second browser or a per-type tile grid (type stays a filter).
 */
export default function LibraryOverview({
  scope = PageScope.BRAND,
}: LibraryOverviewProps) {
  const translate = useTranslations('pages.library.overview');
  const { href } = useOrgUrl();
  const { summary, isLoading, error } = useLibrarySummary();

  const needsReview = summary?.byShelf[LibraryShelf.NEEDS_REVIEW] ?? 0;
  const failed = summary?.byShelf[LibraryShelf.FAILED] ?? 0;
  const starred = summary?.starredCount ?? 0;
  const total = summary?.total ?? 0;
  // Generated assets do not record a file size, so a zero sum next to a
  // non-empty library means "not measured", not "nothing stored".
  const storage =
    formatIngredientFileSize(summary?.storageBytes) ??
    (total > 0 ? '-' : '0 B');

  const kpiItems = [
    {
      isLoading,
      label: translate('kpi.total'),
      value: total,
    },
    {
      isLoading,
      label: translate('kpi.needsReview'),
      value: needsReview,
    },
    {
      isLoading,
      label: translate('kpi.failed'),
      value: failed,
      tone: failed > 0 ? ('destructive' as const) : undefined,
    },
    {
      isLoading,
      label: translate('kpi.storage'),
      value: storage,
    },
  ];

  const cards: OverviewCard[] = [
    {
      color: 'bg-categorical-emerald/10 text-categorical-emerald',
      cta: translate('cards.review.cta'),
      description:
        needsReview > 0
          ? translate('cards.review.pending', { count: needsReview })
          : translate('cards.review.empty'),
      href: href(createLibraryShelfRoute(LibraryShelf.NEEDS_REVIEW)),
      icon: ClipboardCheck,
      id: 'needs-review',
      label: translate('cards.review.label'),
    },
    ...(failed > 0
      ? [
          {
            color: 'bg-destructive/10 text-destructive',
            cta: translate('cards.failed.cta'),
            description: translate('cards.failed.description', {
              count: failed,
            }),
            href: href(createLibraryShelfRoute(LibraryShelf.FAILED)),
            icon: TriangleAlert,
            id: 'failed',
            label: translate('cards.failed.label'),
          },
        ]
      : []),
    {
      color: 'bg-categorical-blue/10 text-categorical-blue',
      cta: translate('cards.recent.cta'),
      description: translate('cards.recent.description'),
      href: href(RECENT_ROUTE),
      icon: Clock,
      id: 'recent',
      label: translate('cards.recent.label'),
    },
    {
      color: 'bg-categorical-amber/10 text-categorical-amber',
      cta: translate('cards.starred.cta'),
      description:
        starred > 0
          ? translate('cards.starred.count', { count: starred })
          : translate('cards.starred.empty'),
      href: href(STARRED_ROUTE),
      icon: Star,
      id: 'starred',
      label: translate('cards.starred.label'),
    },
    ...(scope === PageScope.BRAND
      ? [
          {
            color: 'bg-categorical-violet/10 text-categorical-violet',
            cta: translate('cards.references.cta'),
            description: translate('cards.references.description'),
            href: href(APP_ROUTES.LIBRARY.REFERENCES),
            icon: ScanFace,
            id: 'references',
            label: translate('cards.references.label'),
          },
        ]
      : []),
  ];

  return (
    <OverviewLayout
      actionsTitle={translate('actionsTitle')}
      cards={cards}
      header={
        <KPISection
          className="mb-0"
          error={error ? translate('error') : null}
          gridCols={{ desktop: 4, mobile: 2 }}
          isLoading={isLoading}
          items={kpiItems}
        />
      }
      icon={Library}
      label={translate('title')}
    />
  );
}
