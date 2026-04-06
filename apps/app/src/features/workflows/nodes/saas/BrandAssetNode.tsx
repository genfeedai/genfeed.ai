'use client';

import type {
  BrandAssetNodeData,
  BrandAssetType,
} from '@genfeedai/workflow-saas';
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

const ASSET_TYPE_OPTIONS: Array<{ value: BrandAssetType; label: string }> = [
  { label: 'Logo', value: 'logo' },
  { label: 'Banner', value: 'banner' },
  { label: 'References', value: 'references' },
];

/**
 * Image icon for brand asset nodes
 */
function ImageIcon({
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
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21,15 16,10 5,21" />
    </svg>
  );
}

function BrandAssetNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<BrandAssetNodeData>(
    props.data,
    brandAssetNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const handleAssetTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, {
        assetType: e.target.value as BrandAssetType,
      });
    },
    [id, updateNodeData],
  );

  const hasResolvedAsset =
    data.resolvedUrl !== null || data.resolvedUrls.length > 0;

  return (
    <NodeCard>
      <NodeHeader
        icon={<ImageIcon />}
        title="Brand Asset"
        badge={<NodeBadge variant="blue">SaaS</NodeBadge>}
      />

      <NodeSelect
        label="Asset Type"
        value={data.assetType}
        onChange={handleAssetTypeChange}
      >
        {ASSET_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NodeSelect>

      {/* Brand label */}
      {data.brandLabel && (
        <p className="text-xs text-muted-foreground">
          Brand: {data.brandLabel}
        </p>
      )}

      {/* Single asset preview (logo/banner) */}
      {data.resolvedUrl && data.assetType !== 'references' && (
        <div className="overflow-hidden bg-black/20">
          <img
            src={data.resolvedUrl}
            alt={`${data.assetType} asset`}
            className="h-24 w-full object-contain"
          />
          {data.dimensions && (
            <p className="text-[10px] text-muted-foreground text-center py-1">
              {data.dimensions.width}x{data.dimensions.height}
              {data.mimeType ? ` - ${data.mimeType}` : ''}
            </p>
          )}
        </div>
      )}

      {/* Multiple asset preview (references) */}
      {data.assetType === 'references' && data.resolvedUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {data.resolvedUrls.map((url, index) => (
            <div
              key={`ref-${index}`}
              className="overflow-hidden bg-black/20 aspect-square"
            >
              <img
                src={url}
                alt={`Reference ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}

      {!hasResolvedAsset && (
        <HelpText>Asset will be resolved from brand at execution time</HelpText>
      )}
    </NodeCard>
  );
}

export const BrandAssetNode = memo(BrandAssetNodeComponent);

export const brandAssetNodeDefaults: Partial<BrandAssetNodeData> = {
  assetType: 'logo',
  brandId: null,
  brandLabel: null,
  dimensions: null,
  label: 'Brand Asset',
  mimeType: null,
  resolvedUrl: null,
  resolvedUrls: [],
  status: 'idle',
};
