'use client';

import type { PersonaVideoContentNodeData } from '@cloud/workflow-saas';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { NodeBadge } from '@workflow-cloud/components/ui/badge';
import { NodeCard, NodeHeader } from '@workflow-cloud/components/ui/card';
import { NodeSelect, NodeTextarea } from '@workflow-cloud/components/ui/inputs';
import { MediaPreview } from '@workflow-cloud/components/ui/media';
import {
  HelpText,
  ProcessingMessage,
} from '@workflow-cloud/components/ui/status';
import { coerceNodeData } from '@workflow-cloud/nodes/node-data';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';

const ASPECT_RATIO_OPTIONS: Array<{
  value: PersonaVideoContentNodeData['aspectRatio'];
  label: string;
}> = [
  { label: 'Landscape (16:9)', value: '16:9' },
  { label: 'Portrait (9:16)', value: '9:16' },
  { label: 'Square (1:1)', value: '1:1' },
];

/**
 * Video icon for persona video nodes
 */
function VideoIcon({
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
      <polygon points="23,7 16,12 23,17 23,7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function PersonaVideoContentNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<PersonaVideoContentNodeData>(
    props.data,
    personaVideoContentNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const handleScriptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { script: e.target.value || null });
    },
    [id, updateNodeData],
  );

  const handleAspectRatioChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, {
        aspectRatio: e.target
          .value as PersonaVideoContentNodeData['aspectRatio'],
      });
    },
    [id, updateNodeData],
  );

  return (
    <NodeCard>
      <NodeHeader
        icon={<VideoIcon />}
        title="Persona Video"
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
      <NodeTextarea
        label="Script"
        value={data.script || ''}
        onChange={handleScriptChange}
        placeholder="Enter the video script or narration..."
        rows={4}
      />

      <NodeSelect
        label="Aspect Ratio"
        value={data.aspectRatio}
        onChange={handleAspectRatioChange}
      >
        {ASPECT_RATIO_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NodeSelect>

      {/* Video preview */}
      {data.resolvedVideoUrl && (
        <MediaPreview src={data.resolvedVideoUrl} type="video" controls />
      )}

      {data.status === 'processing' && (
        <ProcessingMessage message="Generating video..." />
      )}

      {!data.resolvedVideoUrl && data.status !== 'processing' && (
        <HelpText>Connect a Brand node and provide a script</HelpText>
      )}
    </NodeCard>
  );
}

export const PersonaVideoContentNode = memo(PersonaVideoContentNodeComponent);

export const personaVideoContentNodeDefaults: Partial<PersonaVideoContentNodeData> =
  {
    aspectRatio: '16:9',
    label: 'Persona Video',
    personaId: null,
    resolvedAvatarProvider: null,
    resolvedJobId: null,
    resolvedPersonaId: null,
    resolvedPersonaLabel: null,
    resolvedVideoUrl: null,
    script: null,
    status: 'idle',
    type: 'personaVideoContent',
  };
