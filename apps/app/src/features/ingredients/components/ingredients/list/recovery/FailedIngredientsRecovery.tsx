'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IngredientRecoveryGroup } from '@genfeedai/contracts/interfaces/ingredients/ingredient-recovery.interface';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import type {
  FailedIngredientPreviewProps,
  FailedIngredientRowProps,
  FailedIngredientsRecoveryProps,
} from '@genfeedai/props/content/ingredient-recovery.props';
import {
  getIngredientModelLabel,
  getIngredientPromptText,
} from '@genfeedai/utils/media/ingredient-ledger.util';
import {
  getIngredientPreviewUrl,
  isRasterPreviewUrl,
} from '@genfeedai/utils/media/ingredient-preview.util';
import { getIngredientRecovery } from '@genfeedai/utils/media/ingredient-recovery.util';
import { getIngredientDisplayLabel } from '@genfeedai/utils/media/ingredient-type.util';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import {
  CircleAlert,
  CircleHelp,
  FileImage,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { createPortal } from 'react-dom';

const GROUPS: readonly IngredientRecoveryGroup[] = [
  'attention',
  'retry',
  'unknown',
];

/** Failed outputs have no preview. Only actual source records may supply one. */
function FailedIngredientPreview({ ingredient }: FailedIngredientPreviewProps) {
  const grant = useAuthorizedMediaPreview(ingredient);
  const preview = grant
    ? isRasterPreviewUrl(grant.url)
      ? grant.url
      : ''
    : getIngredientPreviewUrl(ingredient);
  return preview ? (
    <Image
      alt=""
      className="size-10 rounded-md object-cover outline-media"
      height={40}
      width={40}
      sizes="40px"
      src={preview}
    />
  ) : (
    <FileImage aria-hidden="true" className="size-5 text-muted-foreground" />
  );
}

function FailedIngredientRow({
  ingredient,
  isSelected,
  hasRetried,
  isActionsEnabled,
  isRecovering,
  onToggle,
  onDelete,
  onRetry,
  onInspect,
  onReview,
}: FailedIngredientRowProps) {
  const t = useTranslations('pages.library.recovery');
  const formatter = useFormatter();
  const recovery = getIngredientRecovery(ingredient);
  const label = getIngredientDisplayLabel(ingredient) || t('untitled');
  const prompt = getIngredientPromptText(ingredient) || ingredient.text;
  const model = getIngredientModelLabel(ingredient);
  const source = ingredient.sources?.find(
    (item) => typeof item === 'object' && !item.isDeleted,
  );
  const createdAt = ingredient.createdAt
    ? new Date(ingredient.createdAt)
    : null;
  return (
    <li
      className="grid min-w-0 items-center gap-3 border-t border-border px-4 py-3 lg:grid-cols-[minmax(12rem,1.3fr)_minmax(10rem,1fr)_minmax(9rem,.9fr)_8rem] xl:grid-cols-[minmax(12rem,1.3fr)_minmax(10rem,1fr)_minmax(9rem,.9fr)_minmax(7rem,.7fr)_8rem]"
      data-testid={`failed-asset-${ingredient.id}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {isActionsEnabled ? (
          <Checkbox
            aria-label={t('selectAsset', { label })}
            isChecked={isSelected}
            isDisabled={isRecovering}
            onCheckedChange={onToggle}
          />
        ) : null}
        <Button
          ariaLabel={t('inspectAsset', { label })}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => onInspect(ingredient)}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
            {typeof source === 'object' ? (
              <FailedIngredientPreview ingredient={source} />
            ) : (
              <FileImage
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium" title={label}>
              {label}
            </span>
            <span className="text-xs text-muted-foreground">
              {typeof source === 'object' ? t('reference') : t('savedRequest')}
              {createdAt && !Number.isNaN(createdAt.getTime())
                ? ` · ${formatter.dateTime(createdAt, { day: 'numeric', month: 'short' })}`
                : ''}
            </span>
          </span>
        </Button>
      </div>
      <p className="line-clamp-2 min-w-0 break-words text-xs leading-relaxed text-muted-foreground">
        {prompt || t('noPrompt')}
      </p>
      <div className="flex min-w-0 items-center gap-2 text-xs text-warning">
        <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 break-words">
          {hasRetried ? t('retryStarted') : t(`reasons.${recovery.reason}`)}
        </span>
      </div>
      <span
        className="hidden min-w-0 truncate self-center text-xs text-muted-foreground xl:block"
        title={model || undefined}
      >
        {model || '—'}
      </span>
      <div className="flex shrink-0 items-center gap-2 lg:justify-end">
        <Button
          label={hasRetried ? t('started') : t(`actions.${recovery.action}`)}
          className="w-20 shrink-0"
          withWrapper={false}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          isDisabled={
            isRecovering ||
            hasRetried ||
            (!isActionsEnabled && recovery.action === 'retry')
          }
          onClick={() =>
            recovery.action === 'retry'
              ? onRetry([ingredient])
              : recovery.action === 'viewDetails'
                ? onInspect(ingredient)
                : onReview(ingredient)
          }
        />
        {isActionsEnabled ? (
          <Button
            ariaLabel={t('deleteAsset', { label })}
            tooltip={t('deleteAsset', { label })}
            icon={<Trash2 className="size-4" />}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            isDisabled={isRecovering}
            onClick={() => onDelete([ingredient.id])}
          />
        ) : null}
      </div>
    </li>
  );
}

export default function FailedIngredientsRecovery({
  ingredients,
  selectedIds,
  isActionsEnabled,
  isRecovering,
  retriedIds,
  onSelectionChange,
  onDelete,
  onRetry,
  onInspect,
  onReview,
  actionSlot,
}: FailedIngredientsRecoveryProps) {
  const t = useTranslations('pages.library.recovery');
  const groups = useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        items: ingredients.filter(
          (ingredient) => getIngredientRecovery(ingredient).group === group,
        ),
      })),
    [ingredients],
  );
  const visibleIds = ingredients.map((ingredient) => ingredient.id);
  const selectedVisibleIds = selectedIds.filter((id) =>
    visibleIds.includes(id),
  );
  const deleteAll =
    isActionsEnabled && ingredients.length > 0 ? (
      <Button
        label={t('clear')}
        ariaLabel={t('deleteAll', { count: ingredients.length })}
        tooltip={t('deleteAll', { count: ingredients.length })}
        icon={<Trash2 className="size-4" />}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
        className="border border-destructive/40 text-destructive hover:bg-destructive/10"
        isDisabled={isRecovering}
        onClick={() => onDelete(visibleIds)}
      />
    ) : null;
  return (
    <div
      className="min-w-0 space-y-4"
      data-testid="failed-ingredients-recovery"
      aria-busy={isRecovering}
    >
      {actionSlot ? (
        createPortal(deleteAll, actionSlot)
      ) : deleteAll ? (
        <div className="flex justify-end">{deleteAll}</div>
      ) : null}
      {groups.map(({ group, items }) => (
        <Collapsible
          key={group}
          defaultOpen={group !== 'unknown'}
          className="min-w-0 rounded-lg border border-border"
          data-testid={`recovery-group-${group}`}
        >
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <CollapsibleTrigger className="min-w-0 flex-1 gap-3 py-0 text-left hover:no-underline">
              <span className="flex min-w-0 items-center gap-3">
                {group === 'attention' ? (
                  <CircleAlert
                    aria-hidden="true"
                    className="size-5 shrink-0 text-warning"
                  />
                ) : group === 'retry' ? (
                  <RefreshCw
                    aria-hidden="true"
                    className="size-5 shrink-0 text-warning"
                  />
                ) : (
                  <CircleHelp
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {t(`groups.${group}.title`)}{' '}
                    <span className="font-normal text-muted-foreground">
                      · {items.length}
                    </span>
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {t(`groups.${group}.description`)}
                  </span>
                </span>
              </span>
            </CollapsibleTrigger>
            {group === 'retry' &&
            isActionsEnabled &&
            items.some((item) => !retriedIds.includes(item.id)) ? (
              <Button
                label={t('actions.retry')}
                ariaLabel={t('retryGroup', {
                  count: items.filter((item) => !retriedIds.includes(item.id))
                    .length,
                })}
                size={ButtonSize.SM}
                isDisabled={isRecovering}
                onClick={() =>
                  onRetry(items.filter((item) => !retriedIds.includes(item.id)))
                }
              />
            ) : null}
          </div>
          <CollapsibleContent>
            {items.length === 0 ? (
              <p className="px-4 text-xs text-muted-foreground">
                {t('emptyGroup')}
              </p>
            ) : (
              <ul className="min-w-0">
                {items.map((ingredient) => (
                  <FailedIngredientRow
                    key={ingredient.id}
                    ingredient={ingredient}
                    isSelected={selectedVisibleIds.includes(ingredient.id)}
                    hasRetried={retriedIds.includes(ingredient.id)}
                    isActionsEnabled={isActionsEnabled}
                    isRecovering={isRecovering}
                    onToggle={() =>
                      onSelectionChange(
                        selectedVisibleIds.includes(ingredient.id)
                          ? selectedVisibleIds.filter(
                              (id) => id !== ingredient.id,
                            )
                          : [...selectedVisibleIds, ingredient.id],
                      )
                    }
                    onDelete={onDelete}
                    onRetry={onRetry}
                    onInspect={onInspect}
                    onReview={onReview}
                  />
                ))}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>
      ))}
      {isActionsEnabled ? (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background py-3">
          <Checkbox
            aria-label={t('selectAll')}
            checked={
              selectedVisibleIds.length === 0
                ? false
                : selectedVisibleIds.length === ingredients.length
                  ? true
                  : 'indeterminate'
            }
            isDisabled={isRecovering || ingredients.length === 0}
            onCheckedChange={(checked) =>
              onSelectionChange(checked ? visibleIds : [])
            }
          />
          <span className="text-xs text-muted-foreground">
            {t('selected', { count: selectedVisibleIds.length })}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:block">
            {t('trashHint')}
          </span>
          <Button
            label={t('delete')}
            ariaLabel={t('deleteSelected')}
            icon={<Trash2 className="size-4" />}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            className="ml-auto"
            isDisabled={isRecovering || selectedVisibleIds.length === 0}
            onClick={() => onDelete(selectedVisibleIds)}
          />
        </div>
      ) : null}
    </div>
  );
}
