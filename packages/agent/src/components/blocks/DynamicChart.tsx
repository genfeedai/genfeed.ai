'use client';

import type { DynamicChartProps } from '@genfeedai/agent/components/blocks/DynamicChartView';
import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

/**
 * Lazy boundary for agent chart blocks.
 *
 * `DynamicChartView` statically imports fifteen symbols from `recharts`, which
 * drags the whole charting library into the first load of every route that can
 * render an agent conversation — including the many conversations that never
 * produce a chart block. Recharts measures its own container, so there is no
 * useful server render to preserve.
 *
 * The props type crosses as `import type`, which is erased at build time and so
 * does not pull the implementation module back into the parent chunk.
 */
const DynamicChartView = dynamic(
  () => import('@genfeedai/agent/components/blocks/DynamicChartView'),
  { ssr: false },
);

export default function DynamicChart({
  block,
}: DynamicChartProps): ReactElement {
  return <DynamicChartView block={block} />;
}
