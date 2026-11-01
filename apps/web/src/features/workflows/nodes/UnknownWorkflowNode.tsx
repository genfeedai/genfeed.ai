'use client';

import { CardGap } from '@genfeedai/contracts';
import { Code } from '@genfeedai/ui';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { isNodeDataRecord } from '@/features/workflows/nodes/node-data';

function UnknownWorkflowNodeComponent({
  data,
  type,
}: NodeProps): React.JSX.Element {
  const nodeData = isNodeDataRecord(data) ? data : undefined;
  const originalType =
    typeof nodeData?.originalType === 'string'
      ? nodeData.originalType
      : (type ?? 'unknown');
  const label =
    typeof nodeData?.label === 'string'
      ? nodeData.label
      : 'Unsupported workflow node';

  return (
    <Card gap={CardGap.NONE} className="min-w-[220px]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {label}
        </h3>
        <Badge variant="destructive">Unsupported</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        This workflow contains a node type the editor cannot render yet.
      </p>
      <p className="mt-2 text-2xs text-muted-foreground">
        Type:{' '}
        <Code className="bg-transparent text-foreground">{originalType}</Code>
      </p>
    </Card>
  );
}

export const UnknownWorkflowNode = memo(UnknownWorkflowNodeComponent);
