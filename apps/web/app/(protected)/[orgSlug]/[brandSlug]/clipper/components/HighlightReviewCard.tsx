import {
  ButtonVariant,
  CardGap,
  CardVariant,
  ComponentSize,
} from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import type { BadgeVariant } from '@ui/primitives/badge.variants';
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
import Spinner from '@ui/primitives/spinner';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useReducer, useRef } from 'react';
import type {
  HighlightReviewCardProps,
  RewriteAction,
  RewriteState,
} from '@/props/studio/clipper.props';

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

function getViralityVariant(score: number): BadgeVariant {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'destructive';
}

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
  const viralityVariant = getViralityVariant(highlight.virality_score);

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
      originalScriptRef.current = highlight.script ?? highlight.summary;
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
    highlight.script,
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
    <Card
      gap={CardGap.NONE}
      variant={CardVariant.INSET}
      isSelected={selected}
      className={selected ? undefined : 'opacity-60'}
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
            className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder-muted-foreground focus:border-b focus:border-primary"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Virality score */}
            <Badge variant={viralityVariant}>{highlight.virality_score}</Badge>

            {/* Clip type */}
            <Badge variant="secondary">{highlight.clip_type}</Badge>

            {/* Duration */}
            <Badge isMono variant="secondary">
              {duration}
            </Badge>
          </div>
        </div>
      </div>

      {/* Editable script/transcript */}
      <Textarea
        value={highlight.script ?? highlight.summary}
        onChange={(e) => onScriptEdit(e.target.value)}
        rows={3}
        className="w-full resize-none text-xs"
        placeholder="Edit the script or caption text for this clip..."
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
            <SelectTrigger className="h-7 w-auto px-2 py-1 text-2xs">
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
            <SelectTrigger className="h-7 w-auto px-2 py-1 text-2xs">
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
            variant={ButtonVariant.DEFAULT}
            className="flex items-center gap-1 rounded px-3 py-1 text-2xs font-medium"
            onClick={handleViralRewrite}
            disabled={isRewriting}
          >
            {isRewriting ? (
              <Spinner
                size={ComponentSize.XS}
                className="text-primary-foreground"
              />
            ) : null}
            <span>{isRewriting ? 'Rewriting...' : 'Make it viral'}</span>
          </Button>

          {/* Restore original */}
          {hasBeenRewritten && (
            <Button
              variant={ButtonVariant.UNSTYLED}
              className="text-2xs text-muted-foreground hover:text-foreground"
              onClick={handleRestoreOriginal}
            >
              Restore original
            </Button>
          )}
        </div>
      )}

      {/* Rewrite error */}
      {rewriteError && (
        <div className="mt-1.5 text-2xs text-destructive">{rewriteError}</div>
      )}

      {/* Tags */}
      {highlight.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {highlight.tags.map((tag) => (
            <Badge key={tag} variant="secondary" casing="normal">
              #{tag}
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}
