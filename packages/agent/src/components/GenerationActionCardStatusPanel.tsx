import type { GenerationActionCardStatus } from '@genfeedai/agent/components/useGenerationActionCard';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createLibraryAssetRoute,
} from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { Check, ImagePlus, Paintbrush, RefreshCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import { AgentRunFailureCard } from './AgentRunFailureCard';
import { GenerationActionCardQualityBadge } from './GenerationActionCardQualityBadge';

type GenerationActionCardStatusPanelProps = {
  status: GenerationActionCardStatus;
  isImage: boolean;
  resultUrl: string | null;
  resultId: string | null;
  error: string | null;
  generationType: string;
  qualityScore: number | undefined;
  qualityFeedback: string[] | undefined;
  onRetry: () => void;
  onRegenerateProp: (() => void) | undefined;
  onUseAsReference?: () => void;
  onAcceptPilot?: () => void;
  onRejectPilot?: () => void;
  pilotDurationSeconds?: number | null;
  isPilotCeilingReached?: boolean;
  paidRejectedCount?: number;
};

export function GenerationActionCardStatusPanel({
  status,
  isImage,
  resultUrl,
  resultId,
  error,
  generationType,
  qualityScore,
  qualityFeedback,
  onRetry,
  onRegenerateProp,
  onUseAsReference,
  onAcceptPilot,
  onRejectPilot,
  pilotDurationSeconds,
  isPilotCeilingReached,
  paidRejectedCount,
}: GenerationActionCardStatusPanelProps): ReactElement | null {
  const translate = useTranslations('agent.generationActionCard');
  const { href } = useOrgUrl();

  if (status === 'idle') return null;

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
      <AgentRunFailureCard
        className="mb-0"
        error={
          isPilotCeilingReached
            ? translate('pilotCeilingReached', {
                count: paidRejectedCount ?? 3,
              })
            : (error ?? 'Generation failed')
        }
      />
    );
  }

  if (status === 'pilot_review') {
    return (
      <div className="space-y-2">
        {resultUrl ? (
          <div className="overflow-hidden border border-border">
            <video src={resultUrl} controls className="w-full">
              <track kind="captions" />
            </video>
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {translate('pilotReviewTitle', {
            seconds: pilotDurationSeconds ?? 0,
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            onClick={onAcceptPilot}
            ariaLabel={translate('acceptFullRunAria')}
            className="flex-1"
          >
            <Check className="size-3" />
            {translate('acceptFullRun')}
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={onRejectPilot}
            ariaLabel={translate('rejectPilotAria')}
            className="flex-1"
          >
            <X className="size-3" />
            {translate('rejectPilot')}
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'done' && resultUrl) {
    const libraryHref = href(
      createLibraryAssetRoute(
        generationType === 'video'
          ? IngredientCategory.VIDEO
          : IngredientCategory.IMAGE,
        resultId ?? '',
      ),
    );
    const studioHref = href(
      `${APP_ROUTES.STUDIO.EDIT}?${generationType === 'video' ? 'videoId' : 'imageId'}=${encodeURIComponent(resultId ?? '')}`,
    );

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
        <div className="flex flex-wrap gap-2">
          {onUseAsReference ? (
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={onUseAsReference}
              className="flex-1"
            >
              <ImagePlus className="size-3" />
              Use as input
            </Button>
          ) : null}
          <a
            href={studioHref}
            className="flex flex-1 items-center justify-center gap-1 border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Paintbrush className="size-3" />
            Edit in Studio
          </a>
          <a
            href={libraryHref}
            className="flex flex-1 items-center justify-center border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            Library
          </a>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={onRetry}
            className="flex-1"
          >
            <RefreshCw className="size-3" />
            Regenerate
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
