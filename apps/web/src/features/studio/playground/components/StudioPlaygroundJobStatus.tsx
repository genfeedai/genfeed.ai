'use client';

import { IngredientStatus } from '@genfeedai/contracts';
import { logger } from '@services/core/logger.service';
import GenerationStatus from '@ui/feedback/generation-status/GenerationStatus';
import { useState } from 'react';
import type { ReactElement } from 'react';
import StudioPlaygroundFailureDetailsDialog from '@/features/studio/playground/components/StudioPlaygroundFailureDetailsDialog';
import StudioPlaygroundFailureNotice from '@/features/studio/playground/components/StudioPlaygroundFailureNotice';
import { getStudioPlaygroundTypeConfig } from '@/features/studio/playground/utils/studio-playground-types';
import type { StudioPlaygroundJobStatusProps } from '@/features/studio/props/studio-playground.props';

/**
 * What an open generation says while it is not a finished asset: how far a
 * queued one has got (with Stop), why a failed one failed (with the provider's
 * full error one click away), or that it was cancelled. A finished generation
 * renders nothing here; the inspector carries it.
 */
export default function StudioPlaygroundJobStatus({
  assetActions,
  job,
  onReprompt,
}: StudioPlaygroundJobStatusProps): ReactElement | null {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const { label } = getStudioPlaygroundTypeConfig(job.type);
  const isFailed = job.status === IngredientStatus.FAILED;
  const isPending =
    job.status === IngredientStatus.PROCESSING ||
    job.status === IngredientStatus.DRAFT;

  async function cancelGeneration() {
    setIsCancelling(true);
    try {
      await assetActions.onCancelGeneration?.(job);
    } catch (error: unknown) {
      logger.error('Failed to cancel the Studio generation', error);
    } finally {
      setIsCancelling(false);
    }
  }

  if (isPending) {
    return (
      <GenerationStatus
        assetLabel={label.toLowerCase()}
        detail={job.error}
        isCancelling={isCancelling}
        onCancel={
          job.ingredientId && assetActions.onCancelGeneration
            ? () => void cancelGeneration()
            : undefined
        }
        startedAt={job.createdAt || undefined}
        status={job.phase ?? 'generating'}
      />
    );
  }

  if (!isFailed) return null;

  if (job.phase === 'cancelled') {
    return <GenerationStatus assetLabel={label.toLowerCase()} status="cancelled" />;
  }

  return (
    <>
      <StudioPlaygroundFailureNotice
        assetId={job.id}
        onShowDetails={() => setIsDetailsOpen(true)}
        rawError={job.error}
      />
      <StudioPlaygroundFailureDetailsDialog
        isOpen={isDetailsOpen}
        modelLabel={job.modelKey || 'Auto'}
        onOpenChange={setIsDetailsOpen}
        onRemove={() => assetActions.onRemoveGeneration(job)}
        onReprompt={() => onReprompt(job)}
        prompt={job.prompt}
        rawError={job.error}
        typeLabel={label}
      />
    </>
  );
}
