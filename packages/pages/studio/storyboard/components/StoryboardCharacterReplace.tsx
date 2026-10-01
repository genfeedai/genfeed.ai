'use client';

import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { ButtonVariant, IngredientCategory } from '@genfeedai/contracts';
import type { StoryboardCharacterReplaceProps } from '@genfeedai/props/studio/storyboard.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { ContentRunsService } from '@services/content/content-runs.service';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function StoryboardCharacterReplace({
  brandId,
  runId,
  shotId,
  isDisabled = false,
  saved,
}: StoryboardCharacterReplaceProps) {
  const translate = useTranslations('pages.studioStoryboard.plan');
  const { openGallery } = useGalleryModal();
  const getService = useAuthedService((token: string) =>
    ContentRunsService.getInstance(token),
  );
  const [imageAssetIds, setImageAssetIds] = useState<string[]>(
    saved?.imageAssetIds ?? [],
  );
  const [prompt, setPrompt] = useState(saved?.prompt ?? '');
  const [isWorking, setIsWorking] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [result, setResult] = useState(saved);

  useEffect(() => {
    setResult(saved);
  }, [saved]);

  function pickImages() {
    openGallery({
      category: IngredientCategory.IMAGE,
      maxSelectableItems: 8,
      title: translate('replaceCharacterImages'),
      onSelect: (selected) => {
        setImageAssetIds(
          selected
            .filter((item) => item.brandId === brandId && !item.isDeleted)
            .map((item) => item.id)
            .slice(0, 8),
        );
      },
    });
  }

  async function submit() {
    setIsWorking(true);
    setHasFailed(false);
    try {
      const service = await getService();
      const trimmed = prompt.trim();
      setResult(
        await service.replaceStoryboardCharacter(brandId, runId, shotId, {
          imageAssetIds,
          ...(trimmed ? { prompt: trimmed } : {}),
        }),
      );
    } catch {
      setHasFailed(true);
    } finally {
      setIsWorking(false);
    }
  }

  const isSubmitDisabled =
    isDisabled ||
    isWorking ||
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
          disabled={isDisabled || isWorking}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          label={translate('replaceCharacterImages')}
          variant={ButtonVariant.SECONDARY}
          disabled={isDisabled || isWorking}
          onClick={pickImages}
        />
        <Button
          label={
            isWorking
              ? translate('replaceCharacterWorking')
              : translate('replaceCharacterSubmit')
          }
          disabled={isSubmitDisabled}
          onClick={() => void submit()}
        />
      </div>
      {imageAssetIds.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate('replaceCharacterImagesSelected', {
            count: imageAssetIds.length,
          })}
        </p>
      ) : null}
      {hasFailed ? (
        <p className="text-xs text-destructive">
          {translate('replaceCharacterFailed')}
        </p>
      ) : null}
      {result ? (
        <p className="text-xs text-muted-foreground">
          {translate('replaceCharacterResult', {
            chargedCredits: result.chargedCredits,
            requestId: result.requestId,
          })}
        </p>
      ) : null}
    </div>
  );
}
