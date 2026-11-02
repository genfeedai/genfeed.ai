'use client';

import { IngredientStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import { getIngredientRecovery } from '@genfeedai/utils/media/ingredient-recovery.util';
import { useAuthorizedMediaPreview } from '@hooks/media/use-authorized-media-preview';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionList from '@ui/collection/CollectionList';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Badge } from '@ui/primitives/badge';
import { EmptyState } from '@ui/primitives/empty-state';
import { Skeleton } from '@ui/primitives/skeleton';
import { ImageOff } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { studioAssetAccessibleLabel } from '@/features/studio/playground/utils/studio-playground-recipe';
import { getStudioPlaygroundTypeConfig } from '@/features/studio/playground/utils/studio-playground-types';
import type {
  StudioPlaygroundGenerationListProps,
  StudioPlaygroundGenerationRowProps,
} from '@/features/studio/props/studio-playground.props';

const SKELETON_SLOTS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const IMAGE_TYPES = new Set(['image', 'image-edit']);

function GenerationThumbnail({
  job,
}: Pick<StudioPlaygroundGenerationRowProps, 'job'>): ReactElement {
  const preview = useAuthorizedMediaPreview(job.ingredient ?? null);
  const source = preview
    ? preview.state === 'READY'
      ? IMAGE_TYPES.has(job.type)
        ? preview.url
        : job.ingredient?.thumbnailUrl
      : null
    : (job.ingredient?.thumbnailUrl ?? job.url);

  return (
    <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground/5">
      {source ? (
        <Image alt="" className="object-cover" fill sizes="48px" src={source} />
      ) : (
        <ImageOff aria-hidden="true" className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}

/**
 * One generation in the list. A row is the whole lifecycle — queued, ready or
 * failed — so a generation never disappears and reappears somewhere else once
 * the socket resolves it. Everything the old tile offered on hover (stop,
 * retry, reprompt, remove) is in the row's menu; the rest is in the open
 * generation.
 */
function StudioPlaygroundGenerationRow({
  assetActions,
  job,
  onReprompt,
}: StudioPlaygroundGenerationRowProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const translateRecovery = useTranslations('pages.library.recovery');
  const locale = useLocale();
  const { href } = useOrgUrl();
  const { label } = getStudioPlaygroundTypeConfig(job.type);
  const accessibleLabel = studioAssetAccessibleLabel(job);
  const isFailed = job.status === IngredientStatus.FAILED;
  const isPending =
    job.status === IngredientStatus.PROCESSING ||
    job.status === IngredientStatus.DRAFT;
  const isCancelled = isFailed && job.phase === 'cancelled';
  const ingredient = job.ingredient;
  const recovery = assetActions.failedRecovery;
  const canRecover =
    recovery !== undefined &&
    isFailed &&
    !isCancelled &&
    ingredient !== undefined &&
    ingredient.status === IngredientStatus.FAILED &&
    !ingredient.isDeleted &&
    job.id === ingredient.id &&
    job.ingredientId === ingredient.id;

  const overflow: CollectionOverflowAction[] = [];
  if (isPending && job.ingredientId && assetActions.onCancelGeneration) {
    overflow.push({
      id: 'stop',
      label: translate('stopGeneration'),
      onSelect: () => {
        void Promise.resolve(assetActions.onCancelGeneration?.(job)).catch(
          (error: unknown) => {
            // The job keeps its current status and the Studio reconciler
            // corrects it on the next pass.
            logger.error('Failed to cancel the Studio generation', error);
          },
        );
      },
    });
  }
  if (canRecover) {
    const action = getIngredientRecovery(ingredient).action;
    const hasRetried = recovery.retriedIds.includes(ingredient.id);
    overflow.push({
      id: 'recover',
      isDisabled: recovery.isRecovering || hasRetried,
      label: hasRetried
        ? translateRecovery('started')
        : translateRecovery(`actions.${action}`),
      onSelect: () => {
        if (action === 'retry') recovery.onRetryFailedIngredient(ingredient);
        else if (action === 'viewDetails') assetActions.onSeeDetails(ingredient);
        else void recovery.onReviewFailedIngredient(ingredient);
      },
    });
  }
  if (!isPending) {
    overflow.push({
      id: 'reprompt',
      label: translate('reprompt'),
      onSelect: () => onReprompt(job),
    });
  }
  if (isFailed) {
    overflow.push({
      id: 'remove',
      isDestructive: true,
      label: translate('remove'),
      onSelect: () => assetActions.onRemoveGeneration(job),
    });
  }

  return (
    <ListRow
      ariaLabel={translate('selectGenerationAria', {
        prompt: accessibleLabel,
        type: label,
      })}
      data-testid={`studio-generation-row-${job.id}`}
      density="compact"
      href={href(`${APP_ROUTES.STUDIO.PLAYGROUND}/${job.id}`)}
      leading={<GenerationThumbnail job={job} />}
      meta={
        <>
          <span>{label}</span>
          <span>{job.modelKey || translate('inspector.autoModel')}</span>
          <span>
            {job.createdAt
              ? new Date(job.createdAt).toLocaleString(locale)
              : ''}
          </span>
        </>
      }
      title={accessibleLabel}
      trailing={
        <div className="flex items-center gap-2">
          {isPending ? (
            <Badge status="processing">{translate('generating')}</Badge>
          ) : null}
          {isFailed ? (
            <Badge status={isCancelled ? 'cancelled' : 'failed'} />
          ) : null}
          <CollectionItemActions
            overflow={overflow}
            overflowLabel={translate('rowActions', { name: accessibleLabel })}
          />
        </div>
      }
    />
  );
}

/**
 * Everything this brand has generated, newest first — live jobs from the
 * current session merged over the stored library rows so a fresh render never
 * loses the run the operator just kicked off.
 */
export default function StudioPlaygroundGenerationList({
  assetActions,
  isLoading,
  jobs,
  onReprompt,
}: StudioPlaygroundGenerationListProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');

  if (jobs.length === 0) {
    return isLoading ? (
      <div
        className="flex flex-col gap-2"
        data-testid="studio-results-skeleton"
      >
        {SKELETON_SLOTS.map((slot) => (
          <Skeleton className="h-16 w-full" key={slot} variant="rounded" />
        ))}
      </div>
    ) : (
      <EmptyState
        description={translate('emptyDescription')}
        title={translate('emptyTitle')}
      />
    );
  }

  return (
    <CollectionList data-testid="studio-playground-results">
      {jobs.map((job) => (
        <StudioPlaygroundGenerationRow
          assetActions={assetActions}
          job={job}
          key={job.id}
          onReprompt={onReprompt}
        />
      ))}
    </CollectionList>
  );
}
