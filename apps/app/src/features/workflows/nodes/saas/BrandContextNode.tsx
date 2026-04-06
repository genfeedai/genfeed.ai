'use client';

import type { BrandContextNodeData } from '@genfeedai/workflow-saas';
import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { NodeBadge } from '@/features/workflows/components/ui/badge';
import { NodeCard, NodeHeader } from '@/features/workflows/components/ui/card';
import { HelpText } from '@/features/workflows/components/ui/status';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';

/**
 * Palette icon for brand context nodes
 */
function PaletteIcon({
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
      <circle cx="13.5" cy="6.5" r="1.5" />
      <circle cx="17.5" cy="10.5" r="1.5" />
      <circle cx="8.5" cy="7.5" r="1.5" />
      <circle cx="6.5" cy="12.5" r="1.5" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.5-4.5-9.99-10-9.99z" />
    </svg>
  );
}

function BrandContextNodeComponent(props: NodeProps): React.JSX.Element {
  const data = coerceNodeData<BrandContextNodeData>(
    props.data,
    brandContextNodeDefaults,
  );
  const hasResolved =
    data.resolvedVoice !== null ||
    data.resolvedColors !== null ||
    data.resolvedFonts !== null ||
    data.resolvedModels !== null;

  return (
    <NodeCard>
      <NodeHeader
        icon={<PaletteIcon />}
        title="Brand Context"
        badge={<NodeBadge variant="blue">SaaS</NodeBadge>}
      />

      {/* Brand label */}
      {data.brandLabel && (
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{data.brandLabel}</p>
          {data.brandHandle && (
            <span className="text-xs text-muted-foreground">
              @{data.brandHandle}
            </span>
          )}
        </div>
      )}

      {/* Resolved context display */}
      {hasResolved ? (
        <div className="space-y-2">
          {/* Voice */}
          {data.resolvedVoice && (
            <div className="p-2 border border-white/[0.08] bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Voice</p>
              <p className="text-xs line-clamp-2">{data.resolvedVoice}</p>
            </div>
          )}

          {/* Colors */}
          {data.resolvedColors && (
            <div className="p-2 border border-white/[0.08] bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Colors</p>
              <div className="flex gap-1">
                {Object.entries(data.resolvedColors).map(([key, color]) => (
                  <div key={key} className="text-center">
                    <span
                      className="inline-block h-5 w-5 rounded border border-white/[0.08]"
                      style={{ backgroundColor: color }}
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {key}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fonts */}
          {data.resolvedFonts && (
            <div className="p-2 border border-white/[0.08] bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Font</p>
              <p className="text-xs">{data.resolvedFonts}</p>
            </div>
          )}

          {/* Models */}
          {data.resolvedModels && (
            <div className="p-2 border border-white/[0.08] bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">
                Default Models
              </p>
              <div className="space-y-0.5 text-xs">
                {data.resolvedModels.image && (
                  <p className="truncate">Image: {data.resolvedModels.image}</p>
                )}
                {data.resolvedModels.video && (
                  <p className="truncate">Video: {data.resolvedModels.video}</p>
                )}
                {data.resolvedModels.music && (
                  <p className="truncate">Music: {data.resolvedModels.music}</p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <HelpText>Brand context will be injected at execution time</HelpText>
      )}
    </NodeCard>
  );
}

export const BrandContextNode = memo(BrandContextNodeComponent);

export const brandContextNodeDefaults: Partial<BrandContextNodeData> = {
  brandHandle: null,
  brandId: null,
  brandLabel: null,
  label: 'Brand Context',
  resolvedColors: null,
  resolvedFonts: null,
  resolvedModels: null,
  resolvedVoice: null,
  status: 'idle',
};
