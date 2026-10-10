'use client';

import { LibraryPlace, LibraryShelf, PageScope } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createLibraryShelfRoute,
} from '@genfeedai/contracts/constants';
import type { OverviewCard } from '@genfeedai/contracts/interfaces/ui/overview-card.interface';
import { useLibrarySummary } from '@hooks/data/library/use-library-summary';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { LibraryOverviewProps } from '@props/pages/library-overview.props';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import OverviewLayout from '@ui/overview/OverviewLayout';
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

const RECENT_ROUTE = `${APP_ROUTES.LIBRARY.ASSETS}?place=${LibraryPlace.RECENT}`;
const STARRED_ROUTE = `${APP_ROUTES.LIBRARY.ASSETS}?place=${LibraryPlace.STARRED}`;

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
  const storage = formatIngredientFileSize(summary?.storageBytes) ?? '0 B';

  const kpiItems = [
    {
      description: translate('kpi.totalHelp'),
      isLoading,
      label: translate('kpi.total'),
      value: summary?.total ?? 0,
    },
    {
      description: translate('kpi.needsReviewHelp'),
      isLoading,
      label: translate('kpi.needsReview'),
      value: needsReview,
    },
    {
      description: translate('kpi.failedHelp'),
      isLoading,
      label: translate('kpi.failed'),
      value: failed,
      valueClassName: failed > 0 ? 'text-destructive' : undefined,
    },
    {
      description: translate('kpi.storageHelp'),
      isLoading,
      label: translate('kpi.storage'),
      value: storage,
    },
  ];

  const cards: OverviewCard[] = [
    {
      color: 'bg-emerald-500/12 text-emerald-300',
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
            color: 'bg-rose-500/12 text-rose-300',
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
      color: 'bg-sky-500/12 text-sky-300',
      cta: translate('cards.recent.cta'),
      description: translate('cards.recent.description'),
      href: href(RECENT_ROUTE),
      icon: Clock,
      id: 'recent',
      label: translate('cards.recent.label'),
    },
    {
      color: 'bg-amber-500/12 text-amber-300',
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
            color: 'bg-violet-500/12 text-violet-300',
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
      description={translate('description')}
      header={
        <KPISection
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
