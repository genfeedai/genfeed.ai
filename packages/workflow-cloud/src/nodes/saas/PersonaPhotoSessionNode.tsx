'use client';

import type { PersonaPhotoSessionNodeData } from '@cloud/workflow-saas';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { NodeBadge } from '@workflow-cloud/components/ui/badge';
import { NodeCard, NodeHeader } from '@workflow-cloud/components/ui/card';
import { NodeInput, NodeTextarea } from '@workflow-cloud/components/ui/inputs';
import {
  HelpText,
  ProcessingMessage,
} from '@workflow-cloud/components/ui/status';
import { coerceNodeData } from '@workflow-cloud/nodes/node-data';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';

/**
 * Camera icon for photo session nodes
 */
function CameraIcon({
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
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function PersonaPhotoSessionNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<PersonaPhotoSessionNodeData>(
    props.data,
    personaPhotoSessionNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const handleCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      updateNodeData(id, { count: Math.max(1, Math.min(10, value || 1)) });
    },
    [id, updateNodeData],
  );

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { prompt: e.target.value || null });
    },
    [id, updateNodeData],
  );

  const hasImages = data.resolvedImageUrls.length > 0;

  return (
    <NodeCard>
      <NodeHeader
        icon={<CameraIcon />}
        title="Photo Session"
        badge={<NodeBadge variant="purple">AI</NodeBadge>}
      />

      {/* Persona label */}
      {data.resolvedPersonaLabel && (
        <p className="text-xs text-muted-foreground">
          Persona: {data.resolvedPersonaLabel}
        </p>
      )}

      {/* Provider info */}
      {data.resolvedAvatarProvider && (
        <p className="text-xs text-muted-foreground">
          Provider: {data.resolvedAvatarProvider}
        </p>
      )}

      {/* Configuration */}
      <NodeInput
        label="Photo count"
        type="number"
        value={data.count}
        onChange={handleCountChange}
        min={1}
        max={10}
      />

      <NodeTextarea
        label="Prompt / Style"
        value={data.prompt || ''}
        onChange={handlePromptChange}
        placeholder="Describe the photo style or scene..."
        rows={3}
      />

      {/* Generated images preview grid */}
      {hasImages && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {data.resolvedImageUrls.length} photo
            {data.resolvedImageUrls.length !== 1 ? 's' : ''} generated
          </p>
          <div className="grid grid-cols-3 gap-1">
            {data.resolvedImageUrls.map((url, index) => (
              <div
                key={`photo-${index}`}
                className="overflow-hidden bg-black/20 aspect-square"
              >
                <img
                  src={url}
                  alt={`Generated ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {data.status === 'processing' && (
        <ProcessingMessage message="Generating photos..." />
      )}

      {!hasImages && data.status !== 'processing' && (
        <HelpText>Connect a Brand node to generate persona photos</HelpText>
      )}
    </NodeCard>
  );
}

export const PersonaPhotoSessionNode = memo(PersonaPhotoSessionNodeComponent);

export const personaPhotoSessionNodeDefaults: Partial<PersonaPhotoSessionNodeData> =
  {
    count: 1,
    label: 'Persona Photo Session',
    personaId: null,
    prompt: null,
    resolvedAvatarProvider: null,
    resolvedImageUrls: [],
    resolvedJobIds: [],
    resolvedPersonaId: null,
    resolvedPersonaLabel: null,
    status: 'idle',
    type: 'personaPhotoSession',
  };
