'use client';

import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { ButtonVariant, IngredientCategory } from '@genfeedai/contracts';
import type {
  StoryboardCharacterOperationReceipt,
  StoryboardCharacterReplacement,
} from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import type { StoryboardCharacterReplaceProps } from '@genfeedai/props/studio/storyboard.props';
import { useStoryboardCharacterReplacements } from '@pages/studio/storyboard/hooks/use-storyboard-character-replacements';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Textarea } from '@ui/primitives/textarea';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

export default function StoryboardCharacterReplace({
  brandId,
  runId,
  shotId,
  isDisabled = false,
  saved,
}: StoryboardCharacterReplaceProps) {
  const translate = useTranslations('pages.studioStoryboard.plan');
  const { openGallery } = useGalleryModal();
  const scope = JSON.stringify([brandId, runId, shotId]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const matchingSaved = saved?.shotId === shotId ? saved : undefined;
  const [imageAssetIds, setImageAssetIds] = useState<string[]>(
    matchingSaved?.imageAssetIds ?? [],
  );
  const [prompt, setPrompt] = useState(matchingSaved?.prompt ?? '');
  const lifecycle = useStoryboardCharacterReplacements({
    brandId,
    runId,
    shotId,
    saved,
  });
  const { collection, fallback, isReading, isSubmitting } = lifecycle;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new scope initializes form inputs; saved changes must preserve user edits.
  useEffect(() => {
    setImageAssetIds(matchingSaved?.imageAssetIds ?? []);
    setPrompt(matchingSaved?.prompt ?? '');
  }, [scope]);

  const isSubmitDisabled =
    isDisabled ||
    isSubmitting ||
    imageAssetIds.length < 1 ||
    imageAssetIds.length > 8;

  return (
    <div className="mt-3 grid gap-3">
      <Field
        label={translate('replaceCharacterPrompt')}
        helpText={translate('replaceCharacterHelp')}
      >
        <Textarea
          value={prompt}
          maxLength={1000}
          disabled={isDisabled || isSubmitting}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          label={translate('replaceCharacterImages')}
          variant={ButtonVariant.SECONDARY}
          disabled={isDisabled || isSubmitting}
          onClick={() =>
            pickImages(openGallery, brandId, translate, (ids) => {
              if (currentScope.current === scope) setImageAssetIds(ids);
            })
          }
        />
        <Button
          label={
            isSubmitting
              ? translate('replaceCharacterWorking')
              : translate('replaceCharacterSubmit')
          }
          disabled={isSubmitDisabled}
          onClick={() =>
            void lifecycle.submit({
              imageAssetIds,
              ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
            })
          }
        />
      </div>
      {imageAssetIds.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate('replaceCharacterImagesSelected', {
            count: imageAssetIds.length,
          })}
        </p>
      ) : null}
      {lifecycle.hasSubmitFailed ? (
        <p className="text-xs text-destructive">
          {translate('replaceCharacterFailed')}
        </p>
      ) : null}
      <div
        className="grid gap-2"
        role="region"
        aria-label={translate('replaceCharacterHistory')}
      >
        <Button
          label={translate('replaceCharacterRefreshRequests')}
          variant={ButtonVariant.SECONDARY}
          disabled={isReading}
          onClick={() => void lifecycle.refreshRequests()}
        />
        {isReading ? (
          <p>{translate('replaceCharacterLoadingHistory')}</p>
        ) : null}
        {lifecycle.hasReadFailed ? (
          <p className="text-xs text-destructive">
            {translate('replaceCharacterReadFailed')}
          </p>
        ) : null}
        {!isReading &&
        !collection.operations.length &&
        !collection.legacyReplacements.length &&
        !fallback ? (
          <p>{translate('replaceCharacterEmptyHistory')}</p>
        ) : null}
        {collection.operations.map((receipt) =>
          renderReceipt(
            receipt,
            false,
            translate,
            isReading,
            lifecycle.refreshStatus,
          ),
        )}
        {collection.legacyReplacements.map((receipt) =>
          renderReceipt(
            receipt,
            true,
            translate,
            isReading,
            lifecycle.refreshStatus,
          ),
        )}
        {fallback
          ? renderReceipt(
              fallback,
              true,
              translate,
              isReading,
              lifecycle.refreshStatus,
            )
          : null}
      </div>
    </div>
  );
}

function renderReceipt(
  receipt: StoryboardCharacterOperationReceipt | StoryboardCharacterReplacement,
  isHistorical: boolean,
  translate: ReturnType<typeof useTranslations>,
  isReading: boolean,
  refreshStatus: (operationId: string) => Promise<void>,
) {
  const statusLabels = {
    submitting: 'replaceCharacterStatusSubmitting',
    submitted: 'replaceCharacterStatusSubmitted',
    running: 'replaceCharacterStatusRunning',
    reconciling: 'replaceCharacterStatusReconciling',
    ready: 'replaceCharacterStatusReady',
    failed: 'replaceCharacterStatusFailed',
    cancelled: 'replaceCharacterStatusCancelled',
    blocked: 'replaceCharacterStatusBlocked',
  } as const;
  const operation = 'acceptedRequestIds' in receipt ? receipt : undefined;
  const requestIds = operation
    ? operation.acceptedRequestIds
    : [receipt.requestId];
  const resultUrl = safeResultUrl(receipt.output?.url);
  const errorCode = operation?.errorCode;
  return (
    <div
      key={operation?.operationId ?? receipt.requestId}
      className="grid gap-1 text-xs text-muted-foreground"
    >
      {isHistorical ? (
        <p>{translate('replaceCharacterHistoricalRequest')}</p>
      ) : null}
      {operation ? (
        <p>
          {translate('replaceCharacterOperationId', {
            operationId: operation.operationId,
          })}
        </p>
      ) : null}
      <p>{translate(statusLabels[receipt.status])}</p>
      {requestIds.length ? (
        requestIds.map((requestId) => (
          <p key={requestId}>
            {translate('replaceCharacterRequestId', {
              requestId: requestId ?? '',
            })}
          </p>
        ))
      ) : (
        <p>{translate('replaceCharacterUnknownRequestId')}</p>
      )}
      <p>
        {translate(
          receipt.association === 'current'
            ? 'replaceCharacterAssociationCurrent'
            : 'replaceCharacterAssociationDetached',
        )}
      </p>
      <p>
        {translate('replaceCharacterCredits', {
          chargedCredits: receipt.chargedCredits,
        })}
      </p>
      {errorCode ? (
        <p>
          {/^CHARACTER_REPLACEMENT_[A-Z0-9_]+$/.test(errorCode) &&
          errorCode.length <= 100
            ? errorCode
            : translate('replaceCharacterStatusAttention')}
        </p>
      ) : null}
      {operation ? (
        <Button
          label={translate(
            operation.requestId
              ? 'replaceCharacterRefreshStatus'
              : 'replaceCharacterRefreshSavedStatus',
          )}
          variant={ButtonVariant.SECONDARY}
          disabled={isReading}
          onClick={() => void refreshStatus(operation.operationId)}
        />
      ) : null}
      {resultUrl ? (
        <Link href={resultUrl} target="_blank" rel="noopener noreferrer">
          {translate('replaceCharacterTemporaryResult')}
        </Link>
      ) : null}
      {receipt.output ? (
        <p>{translate('replaceCharacterResultNotRetained')}</p>
      ) : null}
    </div>
  );
}

function safeResultUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function pickImages(
  openGallery: ReturnType<typeof useGalleryModal>['openGallery'],
  brandId: string,
  translate: ReturnType<typeof useTranslations>,
  setImageAssetIds: (ids: string[]) => void,
) {
  openGallery({
    category: IngredientCategory.IMAGE,
    maxSelectableItems: 8,
    title: translate('replaceCharacterImages'),
    onSelect: (selected) =>
      setImageAssetIds(
        selected
          .filter((item) => item.brandId === brandId && !item.isDeleted)
          .map((item) => item.id)
          .slice(0, 8),
      ),
  });
}
