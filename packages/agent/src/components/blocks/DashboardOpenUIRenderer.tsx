'use client';

import DynamicBlockGrid from '@genfeedai/agent/components/blocks/DynamicBlockGrid';
import {
  parseAgentDashboardBlocks,
  parseDashboardOpenUIDocument,
} from '@genfeedai/agent/dashboard/dashboard-openui';
import type { ReactElement } from 'react';
import { useMemo } from 'react';

type DashboardOpenUIRendererProps = {
  blocks?: unknown;
  document?: unknown;
};

function DashboardOpenUIRenderer({
  blocks,
  document,
}: DashboardOpenUIRendererProps): ReactElement {
  const result = useMemo(
    () =>
      document === undefined
        ? parseAgentDashboardBlocks(blocks ?? [])
        : parseDashboardOpenUIDocument(document),
    [blocks, document],
  );

  return <DynamicBlockGrid blocks={result.blocks} />;
}

export default DashboardOpenUIRenderer;
