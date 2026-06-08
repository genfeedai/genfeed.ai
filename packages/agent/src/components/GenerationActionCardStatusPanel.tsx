import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { HiArrowPath, HiPlay } from 'react-icons/hi2';
import { GenerationActionCardQualityBadge } from './GenerationActionCardQualityBadge';

type CardStatus = 'idle' | 'generating' | 'done' | 'error';

type GenerationActionCardStatusPanelProps = {
  status: CardStatus;
  isImage: boolean;
  isPromptEmpty: boolean;
  resultUrl: string | null;
  resultId: string | null;
  error: string | null;
  generationType: string;
  qualityScore: number | undefined;
  qualityFeedback: string[] | undefined;
  onGenerate: () => void;
  onRetry: () => void;
  onRegenerateProp: (() => void) | undefined;
};

export function GenerationActionCardStatusPanel({
  status,
  isImage,
  isPromptEmpty,
  resultUrl,
  resultId,
  error,
  generationType,
  qualityScore,
  qualityFeedback,
  onGenerate,
  onRetry,
  onRegenerateProp,
}: GenerationActionCardStatusPanelProps): ReactElement | null {
  if (status === 'idle') {
    return (
      <Button
        variant={ButtonVariant.DEFAULT}
        onClick={onGenerate}
        isDisabled={isPromptEmpty}
        className="w-full"
      >
        <HiPlay className="size-4" />
        Generate {isImage ? 'Image' : 'Video'}
      </Button>
    );
  }

  if (status === 'generating') {
    return (
      <div className="flex items-center justify-center gap-2 border border-border px-4 py-3">
        <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm text-muted-foreground">Generating…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="space-y-2">
        <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
        <Button
          variant={ButtonVariant.OUTLINE}
          onClick={onRetry}
          className="w-full"
        >
          <HiArrowPath className="size-4" />
          Try Again
        </Button>
      </div>
    );
  }

  if (status === 'done' && resultUrl) {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden border border-border">
          {isImage ? (
            <img
              src={resultUrl}
              alt="Generated result"
              className="w-full object-cover"
            />
          ) : (
            <video src={resultUrl} controls className="w-full">
              <track kind="captions" />
            </video>
          )}
        </div>
        {qualityScore !== undefined && (
          <GenerationActionCardQualityBadge
            score={qualityScore}
            feedback={qualityFeedback}
            onRegenerate={onRegenerateProp ?? onRetry}
          />
        )}
        <div className="flex gap-2">
          <a
            href={`/${generationType === 'video' ? 'videos' : 'images'}/${resultId}`}
            className="flex flex-1 items-center justify-center border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            Open in Library
          </a>
          <Button
            variant={ButtonVariant.OUTLINE}
            size={ButtonSize.SM}
            onClick={onRetry}
            className="flex-1"
          >
            <HiArrowPath className="size-3" />
            Regenerate
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
