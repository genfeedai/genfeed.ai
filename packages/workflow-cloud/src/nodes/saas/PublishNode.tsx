'use client';

import type { PublishNodeData, PublishPlatform } from '@cloud/workflow-saas';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { NodeBadge } from '@workflow-cloud/components/ui/badge';
import { SelectableButton } from '@workflow-cloud/components/ui/button';
import { NodeCard, NodeHeader } from '@workflow-cloud/components/ui/card';
import {
  NodeInput,
  NodeSelect,
  NodeTextarea,
} from '@workflow-cloud/components/ui/inputs';
import {
  HelpText,
  ProcessingMessage,
} from '@workflow-cloud/components/ui/status';
import { coerceNodeData } from '@workflow-cloud/nodes/node-data';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';

const PLATFORM_CONFIG: Array<{ key: PublishPlatform; label: string }> = [
  { key: 'twitter', label: 'X / Twitter' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'linkedin', label: 'LinkedIn' },
];

const SCHEDULE_OPTIONS: Array<{
  value: PublishNodeData['schedule']['type'];
  label: string;
}> = [
  { label: 'Publish Immediately', value: 'immediate' },
  { label: 'Schedule', value: 'scheduled' },
];

/**
 * Share icon for publish nodes
 */
function ShareIcon({
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
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

/**
 * Link icon for published URLs
 */
function LinkIcon({
  className = 'h-3 w-3',
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
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function PublishNodeComponent(props: NodeProps): React.JSX.Element {
  const { id } = props;
  const data = coerceNodeData<PublishNodeData>(props.data, publishNodeDefaults);
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);
  const handlePlatformToggle = useCallback(
    (platform: PublishPlatform) => {
      updateNodeData(id, {
        platforms: {
          ...data.platforms,
          [platform]: !data.platforms[platform],
        },
      });
    },
    [id, data.platforms, updateNodeData],
  );

  const handleScheduleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, {
        schedule: {
          ...data.schedule,
          type: e.target.value as PublishNodeData['schedule']['type'],
        },
      });
    },
    [id, data.schedule, updateNodeData],
  );

  const handleScheduleDatetimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, {
        schedule: {
          ...data.schedule,
          datetime: e.target.value || undefined,
        },
      });
    },
    [id, data.schedule, updateNodeData],
  );

  const handleCaptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { caption: e.target.value });
    },
    [id, updateNodeData],
  );

  const handleHashtagsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const tags = e.target.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      updateNodeData(id, { hashtags: tags });
    },
    [id, updateNodeData],
  );

  const enabledPlatformCount = Object.values(data.platforms).filter(
    Boolean,
  ).length;

  const hasPublished = data.publishedUrls.length > 0;

  return (
    <NodeCard>
      <NodeHeader
        icon={<ShareIcon />}
        title="Publish"
        badge={<NodeBadge variant="green">Output</NodeBadge>}
      />

      {/* Platform selection */}
      <div>
        <label className="text-xs text-muted-foreground">Platforms</label>
        <div className="grid grid-cols-2 gap-1 mt-1">
          {PLATFORM_CONFIG.map((platform) => (
            <SelectableButton
              key={platform.key}
              selected={data.platforms[platform.key]}
              onClick={() => handlePlatformToggle(platform.key)}
            >
              {platform.label}
            </SelectableButton>
          ))}
        </div>
        {enabledPlatformCount === 0 && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Select at least one platform
          </p>
        )}
      </div>

      {/* Schedule type */}
      <NodeSelect
        label="Schedule"
        value={data.schedule.type}
        onChange={handleScheduleTypeChange}
      >
        {SCHEDULE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NodeSelect>

      {/* Scheduled datetime */}
      {data.schedule.type === 'scheduled' && (
        <NodeInput
          label="Date & Time"
          type="datetime-local"
          value={data.schedule.datetime || ''}
          onChange={handleScheduleDatetimeChange}
        />
      )}

      {/* Caption */}
      <NodeTextarea
        label="Caption"
        value={data.caption}
        onChange={handleCaptionChange}
        placeholder="Write your caption..."
        rows={3}
      />

      {/* Hashtags */}
      <NodeInput
        label="Hashtags (comma-separated)"
        type="text"
        value={data.hashtags.join(', ')}
        onChange={handleHashtagsChange}
        placeholder="ai, content, marketing"
      />

      {/* Published URLs */}
      {hasPublished && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Published</p>
          {data.publishedUrls.map((url, index) => (
            <a
              key={`url-${index}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline truncate"
            >
              <LinkIcon />
              {url}
            </a>
          ))}
        </div>
      )}

      {data.status === 'processing' && (
        <ProcessingMessage message="Publishing content..." />
      )}

      {!hasPublished &&
        data.status !== 'processing' &&
        enabledPlatformCount === 0 && (
          <HelpText>Select platforms and connect media to publish</HelpText>
        )}
    </NodeCard>
  );
}

export const PublishNode = memo(PublishNodeComponent);

export const publishNodeDefaults: Partial<PublishNodeData> = {
  caption: '',
  createdPostIds: [],
  hashtags: [],
  inputBrandId: null,
  inputCaption: null,
  inputMediaId: null,
  label: 'Publish',
  platforms: {
    instagram: false,
    linkedin: false,
    tiktok: false,
    twitter: false,
  },
  publishedUrls: [],
  schedule: {
    type: 'immediate',
  },
  status: 'idle',
  type: 'publish',
};
