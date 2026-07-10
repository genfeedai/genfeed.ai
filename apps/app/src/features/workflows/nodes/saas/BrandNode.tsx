'use client';

import type { BrandNodeData } from '@genfeedai/workflow-saas';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import type { NodeProps } from '@xyflow/react';
import Image from 'next/image';
import { memo, useCallback } from 'react';
import { NodeBadge } from '@/features/workflows/components/ui/badge';
import { NodeCard, NodeHeader } from '@/features/workflows/components/ui/card';
import { NodeSelect } from '@/features/workflows/components/ui/inputs';
import { HelpText } from '@/features/workflows/components/ui/status';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';
import { useCloudWorkflowStore } from '@/features/workflows/stores/cloud-workflow-store';
import { canOptimizeImageSource } from '@/lib/images/can-optimize-image-source';

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
  const brands = useCloudWorkflowStore((state) => state.brands);
  const isBrandsLoading = useCloudWorkflowStore(
    (state) => state.isBrandsLoading,
  );

  const handleBrandChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const brandId = e.target.value || null;
      const selectedBrand = brands.find((brand) => brand._id === brandId);
      updateNodeData(id, {
        brandId,
        resolvedBrandId: brandId,
        resolvedLabel: selectedBrand?.label ?? null,
        resolvedLogoUrl: selectedBrand?.logoUrl ?? null,
      });
    },
    [brands, id, updateNodeData],
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
        placeholder={
          isBrandsLoading
            ? 'Loading brands...'
            : brands.length > 0
              ? 'Choose a brand...'
              : 'No brands available'
        }
        value={data.brandId ?? undefined}
        onChange={handleBrandChange}
        disabled={isBrandsLoading || brands.length === 0}
      >
        {brands.map((brand) => (
          <option key={brand._id} value={brand._id}>
            {brand.label}
          </option>
        ))}
      </NodeSelect>

      {/* Resolved brand info */}
      {hasResolvedBrand && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {data.resolvedLogoUrl && (
              <Image
                src={data.resolvedLogoUrl}
                alt={data.resolvedLabel || 'Brand logo'}
                className="size-8 object-contain rounded"
                sizes="32px"
                unoptimized={!canOptimizeImageSource(data.resolvedLogoUrl)}
                width={32}
                height={32}
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
                  className="inline-block size-3 rounded-full border border-white/[0.08]"
                  style={{ backgroundColor: data.resolvedColors.primary }}
                />
                <span
                  className="inline-block size-3 rounded-full border border-white/[0.08]"
                  style={{ backgroundColor: data.resolvedColors.secondary }}
                />
                <span
                  className="inline-block size-3 rounded-full border border-white/[0.08]"
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

const brandNodeDefaults: Partial<BrandNodeData> = {
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
