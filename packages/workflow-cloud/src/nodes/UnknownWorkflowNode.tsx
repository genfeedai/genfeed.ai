'use client';

import { Code } from '@genfeedai/ui';
import { isNodeDataRecord } from '@workflow-cloud/nodes/node-data';
import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';

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
    <div className="min-w-[220px] rounded-lg border border-white/[0.08] bg-card p-4 shadow-lg">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {label}
        </h3>
        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
          Unsupported
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        This workflow contains a node type the editor cannot render yet.
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Type: <Code className="bg-transparent text-foreground">{originalType}</Code>
      </p>
    </div>
  );
}

export const UnknownWorkflowNode = memo(UnknownWorkflowNodeComponent);
