'use client';

import { ButtonVariant, WorkflowNodeStatus } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Slider } from '@ui/primitives/slider';
import type {
  AspectRatio,
  ContentStyle,
  InspirationStyle,
  TrendPlatform,
  TrendVideoInspirationNodeData,
} from '@ui/workflow-builder/types/workflow-saas.types';
import { ExternalLink, Loader2, Sparkles, Video } from 'lucide-react';
import { memo, useCallback } from 'react';

export type {
  AspectRatio,
  ContentStyle,
  InspirationStyle,
  TrendPlatform,
  TrendVideoInspirationNodeData,
};

interface TrendVideoInspirationNodeProps {
  id: string;
  data: TrendVideoInspirationNodeData;
  onUpdate: (id: string, data: Partial<TrendVideoInspirationNodeData>) => void;
  onExecute: (id: string) => void;
}

const PLATFORMS: { value: TrendPlatform; label: string }[] = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Twitter', value: 'twitter' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Reddit', value: 'reddit' },
];

const INSPIRATION_STYLES: {
  value: InspirationStyle;
  label: string;
  desc: string;
}[] = [
  {
    desc: 'Very similar to original',
    label: 'Match Closely',
    value: 'match_closely',
  },
  {
    desc: 'Similar concept, unique execution',
    label: 'Inspired By',
    value: 'inspired_by',
  },
  {
    desc: 'Take the core idea in new direction',
    label: 'Remix',
    value: 'remix_concept',
  },
];

function TrendVideoInspirationNodeComponent({
  id,
  data,
  onUpdate,
  onExecute,
}: TrendVideoInspirationNodeProps) {
  const handlePlatformChange = useCallback(
    (platform: TrendPlatform) => {
      onUpdate(id, { platform });
    },
    [id, onUpdate],
  );

  const handleStyleChange = useCallback(
    (inspirationStyle: InspirationStyle) => {
      onUpdate(id, { inspirationStyle });
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

      {/* Inspiration Style */}
      <div>
        <label className="text-xs text-muted-foreground">
          Inspiration Style
        </label>
        <div className="space-y-1 mt-1">
          {INSPIRATION_STYLES.map((s) => (
            <Button
              key={s.value}
              onClick={() => handleStyleChange(s.value)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              className={`w-full p-2 text-left border transition ${
                data.inspirationStyle === s.value
                  ? 'border-primary bg-primary/10'
                  : 'border-white/[0.08] hover:border-primary/50'
              }`}
            >
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-xs text-muted-foreground">{s.desc}</div>
            </Button>
          ))}
        </div>
      </div>

      {/* Min Viral Score */}
      <div>
        <label className="text-xs text-muted-foreground">
          Min Viral Score: {data.minViralScore}
        </label>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[data.minViralScore]}
          onValueChange={([minViralScore]) => onUpdate(id, { minViralScore })}
          className="mt-1"
        />
      </div>

      {/* Options */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={data.auto}
            onCheckedChange={(checked) =>
              onUpdate(id, { auto: checked === true })
            }
            aria-label="Auto-select top trend"
          />
          Auto-select top trend
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={data.includeOriginalHook}
            onCheckedChange={(checked) =>
              onUpdate(id, { includeOriginalHook: checked === true })
            }
            aria-label="Include original hook as reference"
          />
          Include original hook as reference
        </label>
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        isDisabled={isProcessing}
        type="button"
        variant={ButtonVariant.UNSTYLED}
        className="w-full py-2 bg-primary text-white text-sm font-medium hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate Prompt
          </>
        )}
      </Button>

      {/* Source Video Info */}
      {data.sourceTrendTitle && (
        <div className="p-2 bg-background border border-white/[0.08]">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Video className="w-3 h-3" />
            Source Video
          </div>
          <div className="text-sm text-foreground mt-1 line-clamp-2">
            {data.sourceTrendTitle}
          </div>
          {data.sourceTrendUrl && (
            <a
              href={data.sourceTrendUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary mt-1 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              View Original
            </a>
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
          {data.style && (
            <div className="text-xs text-muted-foreground mt-2">
              Style: {data.style} | Duration: {data.duration}s |{' '}
              {data.aspectRatio}
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

export const TrendVideoInspirationNode = memo(
  TrendVideoInspirationNodeComponent,
);
