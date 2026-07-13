'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { DashboardOpenUIRenderer } from '@genfeedai/agent/components';
import { hydrateLayout } from '@genfeedai/agent/dashboard';
import { ButtonSize, ButtonVariant, PageScope } from '@genfeedai/enums';
import type { DashboardPresetData } from '@genfeedai/interfaces';
import { useAnalytics } from '@hooks/data/analytics/use-analytics/use-analytics';
import { useDashboardLayout } from '@hooks/data/content/use-dashboard-layout/use-dashboard-layout';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Button } from '@ui/primitives/button';
import { useMemo } from 'react';
import WorkspacePageContent from '../workspace-page';

export default function WorkspaceOverviewContent() {
  const { brandId, isReady } = useBrand();

  const {
    layout,
    isLoading: isLayoutLoading,
    resetLayout,
  } = useDashboardLayout({ brandId });

  const hasLayout = !!layout;

  const { analytics } = useAnalytics({
    scope: PageScope.BRAND,
    autoLoad: isReady && hasLayout,
  });

  const bundle = useMemo<DashboardPresetData>(
    () => ({ analytics }),
    [analytics],
  );

  const blocks = useMemo(
    () => (layout ? hydrateLayout(layout.document, bundle) : []),
    [layout, bundle],
  );

  if (!isReady || isLayoutLoading) {
    return <LazyLoadingFallback variant="grid" />;
  }

  if (!layout) {
    return <WorkspacePageContent />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <Button
          withWrapper={false}
          size={ButtonSize.XS}
          variant={ButtonVariant.SECONDARY}
          onClick={() => {
            void resetLayout();
          }}
          className="uppercase tracking-wide"
        >
          Reset to default
        </Button>
      </div>
      <DashboardOpenUIRenderer blocks={blocks} />
    </div>
  );
}
