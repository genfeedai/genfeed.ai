'use client';

import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import type { StoryboardRunRecipe as StoryboardRunRecipeValue } from '@genfeedai/contracts/interfaces';
import type { GallerySelectItem } from '@genfeedai/props/modals/modal-gallery.props';
import type { StoryboardRunRecipeProps } from '@genfeedai/props/studio/storyboard.props';
import StoryboardSelect from '@pages/studio/storyboard/components/StoryboardSelect';
import { useStoryboardAssets } from '@pages/studio/storyboard/hooks/use-storyboard-assets';
import { getStoryboardAssetLabel } from '@pages/studio/storyboard/utils/storyboard-asset-label';
import {
  clampRunDurationSeconds,
  getStoryboardRunAspectRatioOptions,
  getStoryboardRunRecipe,
  STORYBOARD_RUN_MAX_DURATION_SECONDS,
  STORYBOARD_RUN_MAX_OUTPUTS,
  STORYBOARD_RUN_MIN_DURATION_SECONDS,
} from '@pages/studio/storyboard/utils/storyboard-run';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { ImagePlus, Sparkles, X } from 'lucide-react';
import NextImage from 'next/image';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';

const MAX_REFERENCES = 20;
const IMMUTABLE_PHASES = new Set([
  'in_review',
  'approved',
  'paid_draft_creating',
  'paid_draft_ready',
]);

/**
 * The run's generation recipe: objective, output settings and explicit
 * Library references. The parent keys it by run revision, so a saved
 * revision always resets the local edits.
 */
export default function StoryboardRunRecipe({
  isWorking,
  onGenerate,
  run,
}: StoryboardRunRecipeProps): ReactElement {
  const translate = useTranslations('pages.studioStoryboard.recipe');
  const { openGallery } = useGalleryModal();
  const [recipe, setRecipe] = useState<StoryboardRunRecipeValue>(() =>
    getStoryboardRunRecipe(run),
  );
  const referenceScope = `${run.id}:${run.brandId}:${run.revision}`;
  const [pickedReferences, setPickedReferences] = useState<{
    scope: string;
    assets: Record<string, GallerySelectItem>;
  }>({ scope: referenceScope, assets: {} });
  const references = useStoryboardAssets(
    `${run.id}:${run.revision}`,
    run.brandId,
    recipe.referenceAssetIds.map((id) => ({ id, kind: 'image' })),
  );
  const outputKind = run.draft.output.kind;
  const isImmutable =
    Boolean(run.review || run.reviewClaim) || IMMUTABLE_PHASES.has(run.phase);
  const isDisabled = isWorking || isImmutable;
  const hasDuration = outputKind === 'video' || outputKind === 'avatar';

  function patch(next: Partial<StoryboardRunRecipeValue>) {
    setRecipe((current) => ({ ...current, ...next }));
  }

  function openReferencePicker() {
    openGallery({
      category: IngredientCategory.IMAGE,
      maxSelectableItems: MAX_REFERENCES - recipe.referenceAssetIds.length,
      onSelect: (selected) => {
        setPickedReferences((current) => ({
          scope: referenceScope,
          assets: {
            ...(current.scope === referenceScope ? current.assets : {}),
            ...Object.fromEntries(
              (selected ?? [])
                .filter((item) => item.brandId === run.brandId)
                .map((item) => [item.id, item]),
            ),
          },
        }));
        const picked = (selected ?? [])
          .filter((item) => item.brandId === run.brandId)
          .map((item) => item.id);
        setRecipe((current) => ({
          ...current,
          referenceAssetIds: Array.from(
            new Set([...current.referenceAssetIds, ...picked]),
          ).slice(0, MAX_REFERENCES),
        }));
      },
      title: translate('addReferences'),
    });
  }

  return (
    <section
      aria-label={translate('regionLabel')}
      className="flex flex-col gap-4 border-y border-border bg-card/40 p-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {translate('title')}
        </h2>
        <p className="text-xs text-muted-foreground">
          {translate('description')}
        </p>
      </div>

      <Field label={translate('objective')}>
        <Textarea
          isDisabled={isDisabled}
          maxLength={10_000}
          onChange={(event) => patch({ objective: event.target.value })}
          rows={4}
          value={recipe.objective}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        {outputKind === 'copy' ? null : (
          <Field label={translate('aspectRatio')}>
            <StoryboardSelect
              ariaLabel={translate('aspectRatio')}
              isDisabled={isDisabled}
              onChange={(value) =>
                patch({ aspectRatio: value ?? recipe.aspectRatio })
              }
              options={getStoryboardRunAspectRatioOptions(recipe.aspectRatio)}
              placeholder={translate('aspectRatio')}
              value={recipe.aspectRatio}
            />
          </Field>
        )}
        {hasDuration ? (
          <Field label={translate('duration')}>
            <Input
              disabled={isDisabled}
              max={STORYBOARD_RUN_MAX_DURATION_SECONDS}
              min={STORYBOARD_RUN_MIN_DURATION_SECONDS}
              onChange={(event) =>
                patch({
                  durationSeconds: clampRunDurationSeconds(event.target.value),
                })
              }
              type="number"
              value={recipe.durationSeconds ?? ''}
            />
          </Field>
        ) : null}
        <Field label={translate('outputs')}>
          <StoryboardSelect
            ariaLabel={translate('outputs')}
            isDisabled={isDisabled}
            onChange={(value) => patch({ count: value ? Number(value) : 1 })}
            options={Array.from(
              { length: STORYBOARD_RUN_MAX_OUTPUTS },
              (_unused, index) => ({
                label: translate('outputCount', { count: index + 1 }),
                value: String(index + 1),
              }),
            )}
            placeholder={translate('outputCount', { count: 1 })}
            value={String(recipe.count)}
          />
        </Field>
      </div>

      {outputKind === 'copy' ? null : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {translate('referencesHelp')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {recipe.referenceAssetIds.map((assetId, index) => {
              const reference =
                references[`image:${assetId}`] ??
                (pickedReferences.scope === referenceScope
                  ? pickedReferences.assets[assetId]
                  : undefined);
              const label = reference
                ? getStoryboardAssetLabel(reference)
                : undefined;
              const name = label
                ? label
                : reference
                  ? translate.has?.('referenceLabel')
                    ? translate('referenceLabel', { ordinal: index + 1 })
                    : `Reference ${index + 1}`
                  : translate.has?.('referenceUnavailable')
                    ? translate('referenceUnavailable', {
                        ordinal: index + 1,
                      })
                    : `Reference ${index + 1} unavailable`;
              return (
                <Badge key={assetId} variant="ghost">
                  {reference?.thumbnailUrl || reference?.cdnUrl ? (
                    <NextImage
                      width={40}
                      height={40}
                      unoptimized
                      src={reference.thumbnailUrl || reference.cdnUrl || ''}
                      alt=""
                      className="size-10 rounded-md object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <span className="max-w-40 truncate">{name}</span>
                  <Button
                    ariaLabel={translate('removeReference', { id: name })}
                    icon={<X className="size-3" />}
                    isDisabled={isDisabled}
                    onClick={() =>
                      patch({
                        referenceAssetIds: recipe.referenceAssetIds.filter(
                          (candidate) => candidate !== assetId,
                        ),
                      })
                    }
                    size={ButtonSize.XS}
                    variant={ButtonVariant.GHOST}
                  />
                </Badge>
              );
            })}
            <Button
              icon={<ImagePlus className="size-3.5" />}
              isDisabled={
                isDisabled || recipe.referenceAssetIds.length >= MAX_REFERENCES
              }
              label={translate('addReferences')}
              onClick={openReferencePicker}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          icon={<Sparkles className="size-3.5" />}
          isDisabled={isDisabled || recipe.objective.trim().length === 0}
          isLoading={isWorking}
          label={translate('generate')}
          onClick={() => onGenerate(recipe)}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
        />
      </div>
    </section>
  );
}
