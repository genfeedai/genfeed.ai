'use client';

import type { WorkflowCardPreviewProps } from '@genfeedai/props/workflows/workflow-card-preview.props';
import { Workflow } from 'lucide-react';
import { useId, useMemo } from 'react';
import {
  buildWorkflowPreview,
  PREVIEW_NODE_HEIGHT,
  PREVIEW_NODE_WIDTH,
} from './workflow-preview-layout';

const CATEGORY_COLORS: Record<string, string> = {
  input: 'text-success',
  ai: 'text-info',
  processing: 'text-warning',
  output: 'text-success',
  composition: 'text-info',
};

export default function WorkflowGraphPreview({
  name,
  nodes,
  edges,
}: WorkflowCardPreviewProps) {
  const gridId = useId();
  const graph = useMemo(
    () => buildWorkflowPreview({ nodes, edges }),
    [nodes, edges],
  );

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Workflow className="size-10" aria-hidden="true" />
        <span className="text-xs">
          {nodes ? 'No steps yet' : 'Preview unavailable'}
        </span>
      </div>
    );
  }

  return (
    <>
      <svg
        role="img"
        aria-label={`${name} workflow diagram`}
        viewBox={`0 0 ${graph.width} ${graph.height}`}
        className="h-full w-full p-4"
      >
        <title>{`${name}: ${graph.nodes.length} steps, ${graph.edges.length} connections`}</title>
        <defs>
          <pattern
            id={gridId}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 24 0 L 0 0 0 24"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.08"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${gridId})`} />
        {graph.edges.map(({ id, source, target }) => {
          const x = source.x + PREVIEW_NODE_WIDTH;
          const y = source.y + PREVIEW_NODE_HEIGHT / 2;
          const targetY = target.y + PREVIEW_NODE_HEIGHT / 2;
          const bend = Math.max(36, Math.abs(target.x - x) / 2);
          return (
            <path
              key={id}
              d={`M ${x} ${y} C ${x + bend} ${y}, ${target.x - bend} ${targetY}, ${target.x} ${targetY}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-muted-foreground"
            />
          );
        })}
        {graph.nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${node.x},${node.y})`}
            className={CATEGORY_COLORS[node.category] ?? 'text-info'}
          >
            <title>{node.label}</title>
            <rect
              width={PREVIEW_NODE_WIDTH}
              height={PREVIEW_NODE_HEIGHT}
              rx="6"
              fill="hsl(var(--background-secondary))"
              stroke="currentColor"
              strokeOpacity="0.6"
            />
            <rect
              x="10"
              y="20"
              width="4"
              height="24"
              rx="2"
              fill="currentColor"
            />
            <text
              x="24"
              y="37"
              fill="currentColor"
              className="text-foreground"
              fontSize="12"
              fontWeight="500"
            >
              {node.label.length > 22
                ? `${node.label.slice(0, 21)}…`
                : node.label}
            </text>
            <circle
              cx="0"
              cy={PREVIEW_NODE_HEIGHT / 2}
              r="4"
              fill="currentColor"
            />
            <circle
              cx={PREVIEW_NODE_WIDTH}
              cy={PREVIEW_NODE_HEIGHT / 2}
              r="4"
              fill="currentColor"
            />
          </g>
        ))}
      </svg>
      <span className="absolute bottom-2 left-3 rounded bg-background/90 px-2 py-1 text-2xs text-muted-foreground">
        {graph.nodes.length} {graph.nodes.length === 1 ? 'step' : 'steps'}
      </span>
    </>
  );
}
