'use client';

import type { NodeType, WorkflowNodeData } from '@genfeedai/types';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMediaFromNode } from '../lib/mediaExtraction';

interface PreviewTooltipProps {
  nodeType: NodeType;
  nodeData: WorkflowNodeData;
  anchorRect: DOMRect | null;
  isVisible: boolean;
}

// Calculate tooltip position based on anchor and viewport
function calculatePosition(anchorRect: DOMRect): {
  top: number;
  left: number;
  placement: 'top' | 'bottom';
} {
  const tooltipWidth = 280;
  const tooltipHeight = 200;
  const offset = 12;
  const padding = 16;

  const viewportWidth = window.innerWidth;

  // Determine vertical placement (prefer top)
  const spaceAbove = anchorRect.top - padding;
  const placement = spaceAbove >= tooltipHeight + offset ? 'top' : 'bottom';

  // Calculate vertical position
  const top =
    placement === 'top'
      ? anchorRect.top - tooltipHeight - offset
      : anchorRect.bottom + offset;

  // Calculate horizontal position (center align, constrained to viewport)
  let left = anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2;
  left = Math.max(
    padding,
    Math.min(left, viewportWidth - tooltipWidth - padding),
  );

  return { left, placement, top };
}

export function PreviewTooltip({
  nodeType,
  nodeData,
  anchorRect,
  isVisible,
}: PreviewTooltipProps) {
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Get media info
  const mediaInfo = useMemo(() => {
    return getMediaFromNode(nodeType, nodeData);
  }, [nodeType, nodeData]);

  // Calculate position
  const position = useMemo(() => {
    if (!anchorRect) return null;
    return calculatePosition(anchorRect);
  }, [anchorRect]);

  // Handle mounting for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Don't render if no media or not visible
  if (!mounted || !isVisible || !mediaInfo.url || !position) {
    return null;
  }

  const content = (
    <div
      ref={tooltipRef}
      className="fixed z-[100] pointer-events-none"
      style={{
        left: position.left,
        opacity: isVisible ? 1 : 0,
        top: position.top,
        transform: `scale(${isVisible ? 1 : 0.95})`,
        transition: 'opacity 150ms ease-out, transform 150ms ease-out',
      }}
    >
      <div className="w-[280px] bg-card border border-border rounded-lg shadow-xl overflow-hidden">
        {/* Preview content */}
        <div className="relative aspect-video bg-background">
          {mediaInfo.type === 'image' && (
            <Image
              src={mediaInfo.url}
              alt="Preview"
              fill
              className="object-contain"
              unoptimized
            />
          )}
          {mediaInfo.type === 'video' && (
            <video
              src={mediaInfo.url}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-contain"
            />
          )}
        </div>

        {/* Label */}
        <div className="px-3 py-2 border-t border-border">
          <p className="text-xs text-muted-foreground truncate">
            {nodeData.label}
          </p>
        </div>

        {/* Arrow indicator */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-transparent ${
            position.placement === 'top'
              ? 'bottom-[-8px] border-t-8 border-t-border'
              : 'top-[-8px] border-b-8 border-b-border'
          }`}
        />
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
