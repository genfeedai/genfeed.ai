import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
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
import GenerationStatus from '@ui/feedback/generation-status/GenerationStatus';
import { Button } from '@ui/primitives/button';
import {
  Check,
  ExternalLink,
  ImagePlus,
  Paintbrush,
  RefreshCw,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import { AgentRunFailureCard } from './AgentRunFailureCard';
import { GenerationActionCardQualityBadge } from './GenerationActionCardQualityBadge';

type GenerationActionCardStatusPanelProps = {
  status: GenerationActionCardStatus;
  startedAt?: number;
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
  /** #4670 — creates a Studio handoff for this result and opens it. Renders
   * the control only when provided. */
  onOpenInStudio?: () => void;
  onAcceptPilot?: () => void;
  onRejectPilot?: () => void;
  pilotDurationSeconds?: number | null;
  isPilotCeilingReached?: boolean;
  paidRejectedCount?: number;
};

export function GenerationActionCardStatusPanel({
  status,
  startedAt,
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
  onOpenInStudio,
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
      <GenerationStatus
        status="generating"
        startedAt={startedAt}
        assetLabel={generationType}
        className="rounded-lg border border-border"
      />
    );
  }

  if (status === 'error') {
    return (
      <AgentRunFailureCard
        className="mb-0"
        onRetry={isPilotCeilingReached ? undefined : onRetry}
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

  if (status === 'declined') {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {translate('declined')}
      </p>
    );
  }

  if (status === 'pilot_review') {
    return (
      <div className="space-y-2">
        {resultUrl ? (
          <AgentMediaArtifactPreview
            assets={[{ kind: 'video', title: 'Pilot preview', url: resultUrl }]}
            displayMode="featured"
          />
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
        <AgentMediaArtifactPreview
          assets={[
            {
              kind: isImage ? 'image' : 'video',
              title: 'Generated result',
              url: resultUrl,
            },
          ]}
          displayMode="featured"
        />
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
          <Button
            asChild
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            className="flex-1"
            withWrapper={false}
          >
            <Link href={studioHref}>
              <Paintbrush className="size-3" />
              {translate('editResult')}
            </Link>
          </Button>
          {onOpenInStudio ? (
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={onOpenInStudio}
              className="flex-1"
            >
              <ExternalLink className="size-3" />
              {translate('reuseSettings')}
            </Button>
          ) : null}
          <Button
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            className="flex-1"
            withWrapper={false}
          >
            <Link href={libraryHref}>{translate('viewInLibrary')}</Link>
          </Button>
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
