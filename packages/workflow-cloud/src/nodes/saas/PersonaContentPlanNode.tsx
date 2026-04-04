'use client';

import type { PersonaContentPlanNodeData } from '@cloud/workflow-saas';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { NodeBadge } from '@workflow-cloud/components/ui/badge';
import { NodeCard, NodeHeader } from '@workflow-cloud/components/ui/card';
import { NodeInput } from '@workflow-cloud/components/ui/inputs';
import {
  HelpText,
  ProcessingMessage,
} from '@workflow-cloud/components/ui/status';
import Toggle from '@workflow-cloud/components/ui/toggle/Toggle';
import { coerceNodeData } from '@workflow-cloud/nodes/node-data';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';

/**
 * Calendar icon for content plan nodes
 */
function CalendarIcon({
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
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function PersonaContentPlanNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<PersonaContentPlanNodeData>(
    props.data,
    personaContentPlanNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const handleDaysChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { days: parseInt(e.target.value, 10) || 7 });
    },
    [id, updateNodeData],
  );

  const handleCreateDraftsToggle = useCallback(() => {
    updateNodeData(id, { createDrafts: !data.createDrafts });
  }, [id, data.createDrafts, updateNodeData]);

  const hasPlan = data.resolvedPlanEntries.length > 0;

  return (
    <NodeCard>
      <NodeHeader
        icon={<CalendarIcon />}
        title="Content Plan"
        badge={<NodeBadge variant="blue">SaaS</NodeBadge>}
      />

      {/* Persona label */}
      {data.resolvedPersonaLabel && (
        <p className="text-xs text-muted-foreground">
          Persona: {data.resolvedPersonaLabel}
        </p>
      )}

      {/* Configuration */}
      <NodeInput
        label="Number of days"
        type="number"
        value={data.days}
        onChange={handleDaysChange}
        min={1}
        max={90}
      />

      <div className="flex items-center justify-between">
        <label className="text-sm">Create drafts</label>
        <Toggle
          checked={data.createDrafts}
          onChange={handleCreateDraftsToggle}
        />
      </div>

      {/* Plan preview */}
      {hasPlan && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          <p className="text-xs text-muted-foreground">
            {data.resolvedPlanEntries.length} entries
            {data.resolvedDraftsCreated > 0 &&
              ` - ${data.resolvedDraftsCreated} drafts created`}
          </p>
          {data.resolvedPlanEntries.slice(0, 5).map((entry, index) => (
            <div
              key={`plan-${index}`}
              className="p-2 border border-white/[0.08] bg-muted/30 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{entry.format}</span>
                <span className="text-muted-foreground">
                  {entry.scheduledDate}
                </span>
              </div>
              <p className="text-muted-foreground truncate mt-0.5">
                {entry.topic}
              </p>
            </div>
          ))}
          {data.resolvedPlanEntries.length > 5 && (
            <p className="text-[10px] text-muted-foreground text-center">
              +{data.resolvedPlanEntries.length - 5} more entries
            </p>
          )}
        </div>
      )}

      {data.status === 'processing' && (
        <ProcessingMessage message="Generating content plan..." />
      )}

      {!hasPlan && data.status !== 'processing' && (
        <HelpText>Connect a Brand node to generate content plan</HelpText>
      )}
    </NodeCard>
  );
}

export const PersonaContentPlanNode = memo(PersonaContentPlanNodeComponent);

export const personaContentPlanNodeDefaults: Partial<PersonaContentPlanNodeData> =
  {
    createDrafts: false,
    credentialId: null,
    days: 7,
    label: 'Content Plan',
    personaId: null,
    resolvedDraftsCreated: 0,
    resolvedPersonaId: null,
    resolvedPersonaLabel: null,
    resolvedPlanEntries: [],
    status: 'idle',
    type: 'personaContentPlan',
  };
