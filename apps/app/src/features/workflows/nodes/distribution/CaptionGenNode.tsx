'use client';

import { WorkflowNodeStatus } from '@genfeedai/enums';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';
import { NodeBadge } from '@/features/workflows/components/ui/badge';
import {
  NodeButton,
  NodeIconButton,
} from '@/features/workflows/components/ui/button';
import { NodeCard, NodeHeader } from '@/features/workflows/components/ui/card';
import {
  CopyIcon,
  HashIcon,
  RefreshIcon,
  SparklesIcon,
} from '@/features/workflows/components/ui/icons';
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
  CTA_OPTIONS,
  getPlatformLabel,
  PLATFORM_OPTIONS,
  TONE_OPTIONS,
} from '@/features/workflows/nodes/constants';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';
import {
  type CaptionGenNodeData,
  type ExportPlatform,
  PLATFORM_CAPTION_LIMITS,
} from '@/features/workflows/nodes/types';

function CaptionGenNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<CaptionGenNodeData>(
    props.data,
    captionGenNodeDefaults,
  );
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const { executeNode } = useNodeExecution();
  const maxLength = PLATFORM_CAPTION_LIMITS[data.platform] || 2200;
  const captionLength = data.outputCaption?.length || 0;
  const isOverLimit = captionLength > maxLength;

  const handlePlatformChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const platform = e.target.value as ExportPlatform;
      updateNodeData(id, {
        maxLength: PLATFORM_CAPTION_LIMITS[platform] || 2200,
        platform,
      });
    },
    [id, updateNodeData],
  );

  const handleToneChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, {
        tone: e.target.value as CaptionGenNodeData['tone'],
      });
    },
    [id, updateNodeData],
  );

  const handleCtaTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, {
        ctaType: e.target.value as CaptionGenNodeData['ctaType'],
      });
    },
    [id, updateNodeData],
  );

  const handleCustomCtaChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { customCTA: e.target.value });
    },
    [id, updateNodeData],
  );

  const handleHashtagCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { hashtagCount: parseInt(e.target.value, 10) || 5 });
    },
    [id, updateNodeData],
  );

  const handleToggle = useCallback(
    (field: 'includeHashtags' | 'includeEmojis' | 'includeCTA') => {
      updateNodeData(id, { [field]: !data[field] });
    },
    [id, data, updateNodeData],
  );

  const handleGenerate = useCallback(() => {
    executeNode(id);
  }, [id, executeNode]);

  const handleCopy = useCallback(() => {
    if (data.outputCaption) {
      navigator.clipboard.writeText(data.outputCaption);
    }
  }, [data.outputCaption]);

  const canGenerate = data.inputContext;
  const showGenerateButton =
    !data.outputCaption && data.status !== WorkflowNodeStatus.PROCESSING;
  const showHelpText =
    !canGenerate &&
    data.status !== WorkflowNodeStatus.PROCESSING &&
    !data.outputCaption;

  return (
    <NodeCard>
      <NodeHeader
        icon={<SparklesIcon className="h-4 w-4" />}
        title="Caption Generator"
        badge={<NodeBadge variant="purple">AI</NodeBadge>}
      />

      {/* Platform & Tone Row */}
      <div className="grid grid-cols-2 gap-2">
        <NodeSelect
          label="Platform"
          value={data.platform}
          onChange={handlePlatformChange}
        >
          {PLATFORM_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NodeSelect>
        <NodeSelect label="Tone" value={data.tone} onChange={handleToneChange}>
          {TONE_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
              title={option.description}
            >
              {option.label}
            </option>
          ))}
        </NodeSelect>
      </div>

      {/* Options */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm flex items-center gap-2">
            <HashIcon className="h-4 w-4" />
            Include Hashtags
          </label>
          <Toggle
            checked={data.includeHashtags}
            onChange={() => handleToggle('includeHashtags')}
          />
        </div>

        {data.includeHashtags && (
          <div className="pl-6">
            <NodeInput
              label="Number of hashtags"
              type="number"
              value={data.hashtagCount}
              onChange={handleHashtagCountChange}
              min={1}
              max={30}
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <label className="text-sm">Include Emojis</label>
          <Toggle
            checked={data.includeEmojis}
            onChange={() => handleToggle('includeEmojis')}
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="text-sm">Include Call-to-Action</label>
          <Toggle
            checked={data.includeCTA}
            onChange={() => handleToggle('includeCTA')}
          />
        </div>

        {data.includeCTA && (
          <div className="pl-6 space-y-2">
            <NodeSelect value={data.ctaType} onChange={handleCtaTypeChange}>
              {CTA_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NodeSelect>
            {data.ctaType === 'custom' && (
              <NodeInput
                type="text"
                value={data.customCTA || ''}
                onChange={handleCustomCtaChange}
                placeholder="Enter custom CTA..."
              />
            )}
          </div>
        )}
      </div>

      {/* Character Limit Info */}
      <div className="text-xs text-muted-foreground">
        Max: {maxLength.toLocaleString()} characters for{' '}
        {getPlatformLabel(data.platform)}
      </div>

      {/* Generated Caption Output */}
      {data.outputCaption && (
        <div className="relative">
          <div
            className={`p-3 border text-sm ${
              isOverLimit
                ? 'border-red-500 bg-red-50 dark:bg-red-950'
                : 'border-white/[0.08] bg-muted/30'
            }`}
          >
            <p className="whitespace-pre-wrap">{data.outputCaption}</p>
            {data.outputHashtags.length > 0 && (
              <p className="mt-2 text-primary">
                {data.outputHashtags.map((h) => `#${h}`).join(' ')}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            <span
              className={`text-xs ${isOverLimit ? 'text-red-500' : 'text-muted-foreground'}`}
            >
              {captionLength.toLocaleString()} / {maxLength.toLocaleString()}
            </span>
            <div className="flex gap-1">
              <NodeIconButton onClick={handleCopy} title="Copy to clipboard">
                <CopyIcon className="h-4 w-4" />
              </NodeIconButton>
              <NodeIconButton
                onClick={handleGenerate}
                disabled={data.status === WorkflowNodeStatus.PROCESSING}
                title="Regenerate"
              >
                <RefreshIcon className="h-4 w-4" />
              </NodeIconButton>
            </div>
          </div>
        </div>
      )}

      {showGenerateButton && (
        <NodeButton
          fullWidth
          onClick={handleGenerate}
          disabled={!canGenerate}
          icon={<SparklesIcon className="h-4 w-4" />}
        >
          Generate Caption
        </NodeButton>
      )}

      {data.status === WorkflowNodeStatus.PROCESSING && (
        <ProcessingMessage message="Generating caption..." />
      )}

      {showHelpText && (
        <HelpText>Connect a context or prompt input to generate</HelpText>
      )}
    </NodeCard>
  );
}

export const CaptionGenNode = memo(CaptionGenNodeComponent);

export const captionGenNodeDefaults: Partial<CaptionGenNodeData> = {
  ctaType: 'link_bio',
  hashtagCount: 5,
  includeCTA: true,
  includeEmojis: true,
  includeHashtags: true,
  inputContext: null,
  inputMedia: null,
  jobId: null,
  label: 'Caption Generator',
  maxLength: 2200,
  outputCaption: null,
  outputHashtags: [],
  platform: 'instagram_reels',
  status: WorkflowNodeStatus.IDLE,
  tone: 'casual',
};
