'use client';

import OperationalHomeContent from '@app/(protected)/home/content';
import { DashboardOpenUIRenderer } from '@genfeedai/agent/components';
import { hydrateLayout } from '@genfeedai/agent/dashboard';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IDashboardLayout } from '@genfeedai/interfaces';
import { useDashboardLayout } from '@hooks/data/content/use-dashboard-layout/use-dashboard-layout';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { Button } from '@ui/primitives/button';
import { useMemo } from 'react';
import { useWorkspaceDashboardData } from './use-workspace-dashboard-data';

function PersistedWorkspaceLayout({ layout }: { layout: IDashboardLayout }) {
  const { bundle, isLoading } = useWorkspaceDashboardData(layout.brandId);
  const hydration = useMemo(() => {
    if (isLoading) {
      return { blocks: [], isValid: true };
    }

    try {
      return {
        blocks: hydrateLayout(layout.document, bundle),
        isValid: true,
      };
    } catch {
      return { blocks: [], isValid: false };
    }
  }, [bundle, isLoading, layout.document]);

  if (isLoading) {
    return <OperationalHomeContent />;
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
    return <OperationalHomeContent />;
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
