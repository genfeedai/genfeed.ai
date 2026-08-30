'use client';

import OperationalHomeContent from '@app/(protected)/home/content';
import { DashboardOpenUIRenderer } from '@genfeedai/agent/components';
import { hydrateLayout } from '@genfeedai/agent/dashboard';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IDashboardLayout } from '@genfeedai/interfaces';
import { useDashboardLayout } from '@hooks/data/content/use-dashboard-layout/use-dashboard-layout';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { Button } from '@ui/primitives/button';
import { useMemo } from 'react';
import { useWorkspaceDashboardData } from './use-workspace-dashboard-data';

function PersistedWorkspaceLayout({ layout }: { layout: IDashboardLayout }) {
  const { bundle, isLoading } = useWorkspaceDashboardData(layout.brandId);
  const hydration = useMemo(() => {
    try {
      return {
        blocks: hydrateLayout(layout.document, bundle),
        isValid: true,
      };
    } catch {
      return { blocks: [], isValid: false };
    }
  }, [bundle, layout.document]);

  if (isLoading) {
    return (
      <div
        className="grid gap-4 md:grid-cols-2"
        data-testid="workspace-dashboard-loading"
      >
        <SkeletonCard showImage={false} />
        <SkeletonCard showImage={false} />
      </div>
    );
  }

  if (!hydration.isValid) {
    return <OperationalHomeContent />;
  }

  return <DashboardOpenUIRenderer blocks={hydration.blocks} />;
}

export default function WorkspaceOverviewContent() {
  const { brandId, isReady } = useCollectionScope();

  const {
    layout,
    isLoading: isLayoutLoading,
    resetLayout,
  } = useDashboardLayout({ brandId });

  if (!isReady || isLayoutLoading) {
    return (
      <div
        className="flex flex-col gap-6"
        data-testid="workspace-overview-loading"
      >
        <SkeletonCard showImage={false} />
        <SkeletonCard showImage={false} />
      </div>
    );
  }

  if (!layout) {
    return <OperationalHomeContent />;
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
      <PersistedWorkspaceLayout layout={layout} />
    </div>
  );
}
