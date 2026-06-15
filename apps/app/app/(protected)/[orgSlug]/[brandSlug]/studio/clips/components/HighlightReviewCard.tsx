'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type { IHighlight } from '@props/studio/clips.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useReducer, useRef } from 'react';
import type { ClipsApiService } from '../services/clips-api.service';

interface HighlightReviewCardProps {
  highlight: IHighlight;
  selected: boolean;
  onToggle: () => void;
  onTitleEdit: (text: string) => void;
  onScriptEdit: (text: string) => void;
  projectId?: string;
  clipsService?: ClipsApiService;
}

const CLIP_TYPE_COLORS: Record<string, string> = {
  controversial: 'bg-red-500/20 text-red-400 border-red-500/30',
  educational: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  hook: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  quote: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  reaction: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  story: 'bg-green-500/20 text-green-400 border-green-500/30',
  tutorial: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

const PLATFORM_OPTIONS = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'Twitter', value: 'twitter' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'YouTube', value: 'youtube' },
] as const;

const TONE_OPTIONS = [
  { label: 'Hook', value: 'hook' },
  { label: 'Story', value: 'story' },
  { label: 'Educational', value: 'educational' },
  { label: 'Controversial', value: 'controversial' },
  { label: 'Motivational', value: 'motivational' },
] as const;

function formatDuration(startTime: number, endTime: number): string {
  const totalSeconds = Math.round(endTime - startTime);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getViralityColor(score: number): string {
  if (score >= 80) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (score >= 60)
    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

type RewriteState = {
  isRewriting: boolean;
  hasBeenRewritten: boolean;
  platform: string;
  tone: string;
  rewriteError: string | null;
};

type RewriteAction =
  | { type: 'START_REWRITE' }
  | { type: 'REWRITE_SUCCESS' }
  | { type: 'REWRITE_ERROR'; error: string }
  | { type: 'RESTORE' }
  | { type: 'SET_PLATFORM'; platform: string }
  | { type: 'SET_TONE'; tone: string };

const initialRewriteState: RewriteState = {
  isRewriting: false,
  hasBeenRewritten: false,
  platform: 'tiktok',
  tone: 'hook',
  rewriteError: null,
};

function rewriteReducer(
  state: RewriteState,
  action: RewriteAction,
): RewriteState {
  switch (action.type) {
    case 'START_REWRITE':
      return { ...state, isRewriting: true, rewriteError: null };
    case 'REWRITE_SUCCESS':
      return { ...state, isRewriting: false, hasBeenRewritten: true };
    case 'REWRITE_ERROR':
      return { ...state, isRewriting: false, rewriteError: action.error };
    case 'RESTORE':
      return { ...state, hasBeenRewritten: false, rewriteError: null };
    case 'SET_PLATFORM':
      return { ...state, platform: action.platform };
    case 'SET_TONE':
      return { ...state, tone: action.tone };
  }
}

export default function HighlightReviewCard({
  highlight,
  selected,
  onToggle,
  onTitleEdit,
  onScriptEdit,
  projectId,
  clipsService,
}: HighlightReviewCardProps) {
  const duration = formatDuration(highlight.start_time, highlight.end_time);
  const viralityColor = getViralityColor(highlight.virality_score);
  const clipTypeColor =
    CLIP_TYPE_COLORS[highlight.clip_type] ||
    'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';

  // Viral rewrite state
  const [
    { isRewriting, hasBeenRewritten, platform, tone, rewriteError },
    dispatch,
  ] = useReducer(rewriteReducer, initialRewriteState);
  const originalScriptRef = useRef('');

  const handleViralRewrite = useCallback(async () => {
    if (!projectId || !clipsService) return;

    dispatch({ type: 'START_REWRITE' });

    // Save original before overwriting
    if (!hasBeenRewritten) {
      originalScriptRef.current = highlight.summary;
    }

    try {
      const result = await clipsService.rewriteHighlight(
        projectId,
        highlight.id,
        { platform, tone },
      );
      onScriptEdit(result.rewrittenScript);
      dispatch({ type: 'REWRITE_SUCCESS' });
    } catch (err: unknown) {
      dispatch({
        type: 'REWRITE_ERROR',
        error: err instanceof Error ? err.message : 'Rewrite failed',
      });
    }
  }, [
    projectId,
    clipsService,
    highlight.id,
    highlight.summary,
    hasBeenRewritten,
    platform,
    tone,
    onScriptEdit,
  ]);

  const handleRestoreOriginal = useCallback(() => {
    onScriptEdit(originalScriptRef.current);
    dispatch({ type: 'RESTORE' });
  }, [onScriptEdit]);

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        selected
          ? 'border-primary/50 bg-primary/5'
          : 'border-zinc-800 bg-zinc-900/50 opacity-60'
      }`}
    >
      {/* Header: checkbox + title + badges */}
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-1 flex cursor-pointer items-center">
          <Checkbox checked={selected} onCheckedChange={onToggle} />
        </span>

        <div className="flex-1">
          <Input
            value={highlight.title}
            onChange={(e) => onTitleEdit(e.target.value)}
            className="w-full bg-transparent text-sm font-medium text-zinc-100 outline-none placeholder-zinc-600 focus:border-b focus:border-primary"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Virality score */}
            <Badge
              variant="outline"
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${viralityColor}`}
            >
              {highlight.virality_score}
            </Badge>

            {/* Clip type */}
            <Badge
              variant="outline"
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${clipTypeColor}`}
            >
              {highlight.clip_type}
            </Badge>

            {/* Duration */}
            <Badge
              variant="outline"
              className="rounded-full border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-[10px] font-medium text-zinc-400"
            >
              {duration}
            </Badge>
          </div>
        </div>
      </div>

      {/* Editable script/transcript */}
      <Textarea
        value={highlight.summary}
        onChange={(e) => onScriptEdit(e.target.value)}
        rows={3}
        className="w-full resize-none text-xs"
        placeholder="Edit the script that will be read by the avatar..."
      />

      {/* Viral rewrite controls */}
      {projectId && clipsService && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* Platform selector */}
          <Select
            value={platform}
            onValueChange={(v) =>
              dispatch({ type: 'SET_PLATFORM', platform: v })
            }
          >
            <SelectTrigger className="h-7 w-auto px-2 py-1 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tone selector */}
          <Select
            value={tone}
            onValueChange={(v) => dispatch({ type: 'SET_TONE', tone: v })}
          >
            <SelectTrigger className="h-7 w-auto px-2 py-1 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Make it viral button */}
          <Button
            variant={ButtonVariant.UNSTYLED}
            className="flex items-center gap-1 rounded bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleViralRewrite}
            disabled={isRewriting}
          >
            {isRewriting ? (
              <Spinner size={ComponentSize.XS} className="text-white" />
            ) : null}
            <span>{isRewriting ? 'Rewriting...' : 'Make it viral'}</span>
          </Button>

          {/* Restore original */}
          {hasBeenRewritten && (
            <Button
              variant={ButtonVariant.UNSTYLED}
              className="text-[11px] text-zinc-500 hover:text-zinc-300"
              onClick={handleRestoreOriginal}
            >
              Restore original
            </Button>
          )}
        </div>
      )}

      {/* Rewrite error */}
      {rewriteError && (
        <div className="mt-1.5 text-[11px] text-red-400">{rewriteError}</div>
      )}

      {/* Tags */}
      {highlight.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {highlight.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500"
            >
              #{tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
