'use client';

import { ButtonVariant, WorkflowNodeStatus } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import type {
  ContentPreference,
  ContentType,
  TrendHashtagInspirationNodeData,
  TrendPlatform,
} from '@ui/workflow-builder/types/workflow-saas.types';
import { Hash, Loader2, Sparkles } from 'lucide-react';
import { memo, useCallback } from 'react';

export type {
  ContentPreference,
  ContentType,
  TrendHashtagInspirationNodeData,
  TrendPlatform,
};

interface TrendHashtagInspirationNodeProps {
  id: string;
  data: TrendHashtagInspirationNodeData;
  onUpdate: (
    id: string,
    data: Partial<TrendHashtagInspirationNodeData>,
  ) => void;
  onExecute: (id: string) => void;
}

const PLATFORMS: { value: TrendPlatform; label: string }[] = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Twitter', value: 'twitter' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Reddit', value: 'reddit' },
];

const CONTENT_PREFERENCES: { value: ContentPreference; label: string }[] = [
  { label: 'Video', value: 'video' },
  { label: 'Image', value: 'image' },
  { label: 'Any', value: 'any' },
];

function TrendHashtagInspirationNodeComponent({
  id,
  data,
  onUpdate,
  onExecute,
}: TrendHashtagInspirationNodeProps) {
  const handlePlatformChange = useCallback(
    (platform: TrendPlatform) => {
      onUpdate(id, { platform });
    },
    [id, onUpdate],
  );

  const handlePreferenceChange = useCallback(
    (contentPreference: ContentPreference) => {
      onUpdate(id, { contentPreference });
    },
    [id, onUpdate],
  );

  const handleHashtagChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(id, { hashtag: e.target.value || null });
    },
    [id, onUpdate],
  );

  const handleGenerate = useCallback(() => {
    onExecute(id);
  }, [id, onExecute]);

  const isProcessing = data.status === WorkflowNodeStatus.PROCESSING;

  return (
    <div className="space-y-3">
      {/* Platform Selection */}
      <div>
        <label className="text-xs text-muted-foreground">Platform</label>
        <div className="grid grid-cols-5 gap-1 mt-1">
          {PLATFORMS.map((p) => (
            <Button
              key={p.value}
              onClick={() => handlePlatformChange(p.value)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className={`py-1.5 text-xs transition ${
                data.platform === p.value
                  ? 'bg-primary text-white'
                  : 'bg-background text-muted-foreground hover:bg-border'
              }`}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Content Preference */}
      <div>
        <label className="text-xs text-muted-foreground">Content Type</label>
        <div className="grid grid-cols-3 gap-1 mt-1">
          {CONTENT_PREFERENCES.map((p) => (
            <Button
              key={p.value}
              onClick={() => handlePreferenceChange(p.value)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className={`py-1.5 text-xs transition ${
                data.contentPreference === p.value
                  ? 'bg-primary text-white'
                  : 'bg-background text-muted-foreground hover:bg-border'
              }`}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Auto-select toggle */}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={data.auto}
          onCheckedChange={(checked) =>
            onUpdate(id, { auto: checked === true })
          }
          aria-label="Auto-select top trending hashtag"
        />
        Auto-select top trending hashtag
      </label>

      {/* Manual hashtag input */}
      {!data.auto && (
        <div>
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <Hash className="w-3 h-3" />
            Specific Hashtag
          </label>
          <Input
            type="text"
            value={data.hashtag || ''}
            onChange={handleHashtagChange}
            placeholder="Enter hashtag (without #)"
            className="mt-1"
          />
        </div>
      )}

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        isDisabled={isProcessing || (!data.auto && !data.hashtag)}
        type="button"
        variant={ButtonVariant.UNSTYLED}
        className="w-full py-2 bg-primary text-white text-sm font-medium hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate Prompt
          </>
        )}
      </Button>

      {/* Source Hashtag Info */}
      {data.sourceHashtag && (
        <div className="p-2 bg-background border border-white/[0.08]">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Hash className="w-3 h-3" />
            Source Hashtag
          </div>
          <div className="text-sm text-foreground mt-1">
            #{data.sourceHashtag}
          </div>
          {data.hashtagPostCount && (
            <div className="text-xs text-muted-foreground mt-1">
              {data.hashtagPostCount.toLocaleString()} posts
            </div>
          )}
        </div>
      )}

      {/* Generated Prompt */}
      {data.prompt && (
        <div className="p-2 bg-green-500/10 border border-green-500/20">
          <div className="text-xs text-green-400 font-medium mb-1">
            Generated Prompt
          </div>
          <div className="text-sm text-foreground">{data.prompt}</div>
          {data.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {data.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-primary/10 text-primary text-xs"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
          {data.contentType && (
            <div className="text-xs text-muted-foreground mt-2">
              Suggested: {data.contentType} for {data.recommendedPlatform}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {data.error && (
        <div className="p-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {data.error}
        </div>
      )}
    </div>
  );
}

export const TrendHashtagInspirationNode = memo(
  TrendHashtagInspirationNodeComponent,
);
