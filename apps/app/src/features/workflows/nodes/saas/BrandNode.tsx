'use client';

import type { BrandNodeData } from '@genfeedai/workflow-saas';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';
import { NodeBadge } from '@/features/workflows/components/ui/badge';
import { NodeCard, NodeHeader } from '@/features/workflows/components/ui/card';
import { NodeSelect } from '@/features/workflows/components/ui/inputs';
import { HelpText } from '@/features/workflows/components/ui/status';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';

/**
 * Store icon for brand nodes
 */
function StoreIcon({
  className = 'h-4 w-4',
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 9l1-4h16l1 4" />
      <path d="M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" />
      <path d="M9 21V13h6v8" />
    </svg>
  );
}

function BrandNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<BrandNodeData>(props.data, brandNodeDefaults);
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);

  const handleBrandChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { brandId: e.target.value || null });
    },
    [id, updateNodeData],
  );

  const hasResolvedBrand = data.resolvedLabel !== null;

  return (
    <NodeCard>
      <NodeHeader
        icon={<StoreIcon />}
        title="Brand"
        badge={<NodeBadge variant="blue">Input</NodeBadge>}
      />

      <NodeSelect
        label="Select Brand"
        value={data.brandId || ''}
        onChange={handleBrandChange}
      >
        <option value="">Choose a brand...</option>
      </NodeSelect>

      {/* Resolved brand info */}
      {hasResolvedBrand && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {data.resolvedLogoUrl && (
              <img
                src={data.resolvedLogoUrl}
                alt={data.resolvedLabel || 'Brand logo'}
                className="h-8 w-8 object-contain rounded"
              />
            )}
            <div>
              <p className="text-sm font-medium">{data.resolvedLabel}</p>
              {data.resolvedHandle && (
                <p className="text-xs text-muted-foreground">
                  @{data.resolvedHandle}
                </p>
              )}
            </div>
          </div>

          {/* Resolved outputs */}
          <div className="space-y-1 text-xs text-muted-foreground">
            {data.resolvedVoice && (
              <p className="truncate" title={data.resolvedVoice}>
                Voice: {data.resolvedVoice}
              </p>
            )}
            {data.resolvedColors && (
              <div className="flex items-center gap-1">
                <span>Colors:</span>
                <span
                  className="inline-block h-3 w-3 rounded-full border border-white/[0.08]"
                  style={{ backgroundColor: data.resolvedColors.primary }}
                />
                <span
                  className="inline-block h-3 w-3 rounded-full border border-white/[0.08]"
                  style={{ backgroundColor: data.resolvedColors.secondary }}
                />
                <span
                  className="inline-block h-3 w-3 rounded-full border border-white/[0.08]"
                  style={{ backgroundColor: data.resolvedColors.accent }}
                />
              </div>
            )}
            {data.resolvedFonts && (
              <p>
                Fonts: {data.resolvedFonts.heading} / {data.resolvedFonts.body}
              </p>
            )}
          </div>
        </div>
      )}

      {!data.brandId && (
        <HelpText>Select a brand from your organization</HelpText>
      )}
    </NodeCard>
  );
}

export const BrandNode = memo(BrandNodeComponent);

export const brandNodeDefaults: Partial<BrandNodeData> = {
  brandId: null,
  label: 'Brand',
  resolvedBrandId: null,
  resolvedColors: null,
  resolvedFonts: null,
  resolvedHandle: null,
  resolvedLabel: null,
  resolvedLogoUrl: null,
  resolvedModels: null,
  resolvedVoice: null,
  status: 'idle',
  type: 'brand',
};
