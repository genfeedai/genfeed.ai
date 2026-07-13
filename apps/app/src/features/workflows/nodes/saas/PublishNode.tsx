'use client';

import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import type {
  PublishNodeData,
  PublishPlatform,
} from '@genfeedai/workflows/nodes';
import type { NodeProps } from '@xyflow/react';
import { memo, useCallback } from 'react';
import { NodeBadge } from '@/features/workflows/components/ui/badge';
import { SelectableButton } from '@/features/workflows/components/ui/button';
import { NodeCard, NodeHeader } from '@/features/workflows/components/ui/card';
import {
  NodeInput,
  NodeSelect,
  NodeTextarea,
} from '@/features/workflows/components/ui/inputs';
import {
  HelpText,
  ProcessingMessage,
} from '@/features/workflows/components/ui/status';
import { coerceNodeData } from '@/features/workflows/nodes/node-data';
import LinkIcon from './LinkIcon';
import ShareIcon from './ShareIcon';

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
      const tags = e.target.value.split(',').flatMap((tag) => {
        const trimmedTag = tag.trim();
        return trimmedTag ? [trimmedTag] : [];
      });
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
        <span className="text-xs text-muted-foreground">Platforms</span>
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
              key={url}
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

const publishNodeDefaults: Partial<PublishNodeData> = {
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
