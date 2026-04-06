'use client';

import { WorkflowNodeStatus } from '@genfeedai/enums';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';
import { NodeBadge } from '@/features/workflows/components/ui/badge';
import { NodeButton } from '@/features/workflows/components/ui/button';
import {
  NodeCard,
  NodeDescription,
  NodeHeader,
} from '@/features/workflows/components/ui/card';
import {
  ClockIcon,
  ScissorsIcon,
  SparklesIcon,
} from '@/features/workflows/components/ui/icons/node-icons';
import {
  NodeInput,
  NodeSelect,
} from '@/features/workflows/components/ui/inputs';
import {
  HelpText,
  ProcessingMessage,
} from '@/features/workflows/components/ui/status';
import Toggle from '@/features/workflows/components/ui/toggle/Toggle';
import { useNodeExecution } from '@/features/workflows/hooks/useNodeExecution';
import {
  CLIP_CRITERIA_OPTIONS,
  formatTime,
} from '@/features/workflows/nodes/constants';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';
import type { ClipSelectorNodeData } from '@/features/workflows/nodes/types';

function ClipSelectorNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<ClipSelectorNodeData>(
    props.data,
    clipSelectorNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const { executeNode } = useNodeExecution();

  const handleClipCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { clipCount: parseInt(e.target.value, 10) || 3 });
    },
    [id, updateNodeData],
  );

  const handleMinDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, {
        clipDuration: {
          ...data.clipDuration,
          min: parseInt(e.target.value, 10) || 15,
        },
      });
    },
    [id, data.clipDuration, updateNodeData],
  );

  const handleMaxDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, {
        clipDuration: {
          ...data.clipDuration,
          max: parseInt(e.target.value, 10) || 60,
        },
      });
    },
    [id, data.clipDuration, updateNodeData],
  );

  const handleCriteriaChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, {
        selectionCriteria: e.target
          .value as ClipSelectorNodeData['selectionCriteria'],
      });
    },
    [id, updateNodeData],
  );

  const handleToggle = useCallback(
    (field: 'includeIntro' | 'includeOutro') => {
      updateNodeData(id, { [field]: !data[field] });
    },
    [id, data, updateNodeData],
  );

  const handleAnalyze = useCallback(() => {
    executeNode(id);
  }, [id, executeNode]);

  const selectedCriteria = CLIP_CRITERIA_OPTIONS.find(
    (o) => o.value === data.selectionCriteria,
  );

  const canAnalyze = data.inputVideo && data.inputTranscript;
  const showAnalyzeButton =
    data.outputClips.length === 0 &&
    data.status !== WorkflowNodeStatus.PROCESSING;
  const showHelpText =
    !canAnalyze &&
    data.status !== WorkflowNodeStatus.PROCESSING &&
    data.outputClips.length === 0;

  return (
    <NodeCard minWidth="300px">
      <NodeHeader
        icon={<ScissorsIcon />}
        title="AI Clip Selector"
        badge={<NodeBadge variant="orange">Repurposing</NodeBadge>}
      />

      <NodeDescription>
        Analyze long videos and automatically identify the best clips for
        short-form content.
      </NodeDescription>

      <div className="space-y-3">
        <NodeInput
          label="Number of clips"
          type="number"
          value={data.clipCount}
          onChange={handleClipCountChange}
          min={1}
          max={20}
        />

        <div className="grid grid-cols-2 gap-2">
          <NodeInput
            label="Min duration (sec)"
            type="number"
            value={data.clipDuration.min}
            onChange={handleMinDurationChange}
            min={5}
            max={180}
          />
          <NodeInput
            label="Max duration (sec)"
            type="number"
            value={data.clipDuration.max}
            onChange={handleMaxDurationChange}
            min={15}
            max={300}
          />
        </div>

        <div>
          <NodeSelect
            label="Selection criteria"
            value={data.selectionCriteria}
            onChange={handleCriteriaChange}
          >
            {CLIP_CRITERIA_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
                title={option.description}
              >
                {option.label}
              </option>
            ))}
          </NodeSelect>
          {selectedCriteria && (
            <p className="text-xs text-muted-foreground mt-1">
              {selectedCriteria.description}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm">Include intro clip</label>
            <Toggle
              checked={data.includeIntro}
              onChange={() => handleToggle('includeIntro')}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm">Include outro clip</label>
            <Toggle
              checked={data.includeOutro}
              onChange={() => handleToggle('includeOutro')}
            />
          </div>
        </div>
      </div>

      {/* Output clips */}
      {data.outputClips.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">
            Selected Clips
          </h4>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {data.outputClips.map((clip, index) => (
              <div
                key={index}
                className="p-2 border border-white/[0.08] bg-muted/30 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">Clip {index + 1}</span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <ClockIcon />
                    {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-1 flex-1 rounded-full bg-muted"
                    title={`Score: ${(clip.score * 100).toFixed(0)}%`}
                  >
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{ width: `${clip.score * 100}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground w-8">
                    {(clip.score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-muted-foreground">{clip.reason}</p>
                {clip.suggestedCaption && (
                  <p className="italic text-muted-foreground border-l-2 border-primary/30 pl-2">
                    "{clip.suggestedCaption}"
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showAnalyzeButton && (
        <NodeButton
          fullWidth
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          icon={<SparklesIcon />}
        >
          Analyze & Select Clips
        </NodeButton>
      )}

      {data.status === WorkflowNodeStatus.PROCESSING && (
        <ProcessingMessage message="Analyzing video for best clips..." />
      )}

      {showHelpText && (
        <HelpText>Connect a video and transcript to analyze</HelpText>
      )}
    </NodeCard>
  );
}

export const ClipSelectorNode = memo(ClipSelectorNodeComponent);

export const clipSelectorNodeDefaults: Partial<ClipSelectorNodeData> = {
  clipCount: 5,
  clipDuration: { max: 60, min: 15 },
  includeIntro: true,
  includeOutro: false,
  inputTranscript: null,
  inputVideo: null,
  jobId: null,
  label: 'AI Clip Selector',
  outputClips: [],
  selectionCriteria: 'engagement_potential',
  status: WorkflowNodeStatus.IDLE,
};
