'use client';

import { ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Slider } from '@ui/primitives/slider';
import type {
  CheckFrequency,
  TrendPlatform,
  TrendTriggerNodeData,
  TrendType,
} from '@ui/workflow-builder/types/workflow-saas.types';
import { Clock, Hash, TrendingUp, X } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

export type { CheckFrequency, TrendPlatform, TrendTriggerNodeData, TrendType };

interface TrendTriggerNodeProps {
  id: string;
  data: TrendTriggerNodeData;
  onUpdate: (id: string, data: Partial<TrendTriggerNodeData>) => void;
}

const PLATFORMS: { value: TrendPlatform; label: string }[] = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Twitter', value: 'twitter' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Reddit', value: 'reddit' },
];

const TREND_TYPES: { value: TrendType; label: string }[] = [
  { label: 'Video', value: 'video' },
  { label: 'Hashtag', value: 'hashtag' },
  { label: 'Sound', value: 'sound' },
  { label: 'Topic', value: 'topic' },
];

const FREQUENCIES: { value: CheckFrequency; label: string }[] = [
  { label: '15 min', value: '15min' },
  { label: '30 min', value: '30min' },
  { label: '1 hour', value: '1hr' },
  { label: '4 hours', value: '4hr' },
  { label: 'Daily', value: 'daily' },
];

function TrendTriggerNodeComponent({
  id,
  data,
  onUpdate,
}: TrendTriggerNodeProps) {
  const [keywordInput, setKeywordInput] = useState('');

  const handlePlatformChange = useCallback(
    (platform: TrendPlatform) => {
      onUpdate(id, { platform });
    },
    [id, onUpdate],
  );

  const handleAddKeyword = useCallback(() => {
    if (keywordInput.trim() && !data.keywords.includes(keywordInput.trim())) {
      onUpdate(id, { keywords: [...data.keywords, keywordInput.trim()] });
      setKeywordInput('');
    }
  }, [id, data.keywords, keywordInput, onUpdate]);

  const handleRemoveKeyword = useCallback(
    (keyword: string) => {
      onUpdate(id, { keywords: data.keywords.filter((k) => k !== keyword) });
    },
    [id, data.keywords, onUpdate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddKeyword();
      }
    },
    [handleAddKeyword],
  );

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

      {/* Trend Type */}
      <div>
        <label className="text-xs text-muted-foreground">Trend Type</label>
        <Select
          value={data.trendType}
          onValueChange={(value) =>
            onUpdate(id, { trendType: value as TrendType })
          }
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select a trend type" />
          </SelectTrigger>
          <SelectContent>
            {TREND_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Min Viral Score */}
      <div>
        <label className="text-xs text-muted-foreground flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
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

      {/* Check Frequency */}
      <div>
        <label className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Check Frequency
        </label>
        <Select
          value={data.checkFrequency}
          onValueChange={(value) =>
            onUpdate(id, { checkFrequency: value as CheckFrequency })
          }
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select a frequency" />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Keywords Filter */}
      <div>
        <label className="text-xs text-muted-foreground flex items-center gap-1">
          <Hash className="w-3 h-3" />
          Keywords (optional)
        </label>
        <div className="flex gap-1 mt-1">
          <Input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add keyword..."
            className="flex-1"
          />
          <Button
            onClick={handleAddKeyword}
            type="button"
            variant={ButtonVariant.UNSTYLED}
            className="px-2 py-1.5 bg-primary text-white text-xs"
          >
            Add
          </Button>
        </div>
        {data.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {data.keywords.map((keyword) => (
              <span
                key={keyword}
                className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs"
              >
                {keyword}
                <Button
                  onClick={() => handleRemoveKeyword(keyword)}
                  type="button"
                  variant={ButtonVariant.UNSTYLED}
                  className="hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </Button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Last Triggered Info */}
      {data.lastTriggeredAt && (
        <div className="p-2 bg-background border border-white/[0.08]">
          <div className="text-xs text-muted-foreground">Last triggered:</div>
          <div className="text-sm text-foreground mt-1">
            {data.lastTrendTopic || 'Unknown topic'}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {new Date(data.lastTriggeredAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

export const TrendTriggerNode = memo(TrendTriggerNodeComponent);
