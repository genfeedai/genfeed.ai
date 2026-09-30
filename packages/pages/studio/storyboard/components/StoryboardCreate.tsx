'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import {
  useGalleryModal,
  useUploadModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { ButtonVariant, IngredientCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StoryboardSelect from '@pages/studio/storyboard/components/StoryboardSelect';
import { useCreateStoryboard } from '@pages/studio/storyboard/hooks/use-create-storyboard';
import { storyboardAssetLabel } from '@pages/studio/storyboard/utils/storyboard-plan';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Selection/upload saves media only; creating a draft never dispatches paid work. */
export default function StoryboardCreate() {
  const translate = useTranslations('pages.studioStoryboard.create');
  const brandId = useBrandId();
  const { openGallery } = useGalleryModal();
  const { openUpload } = useUploadModal();
  const { href } = useOrgUrl();
  const router = useRouter();
  const { create, error, isCreating, isCurrentResult } = useCreateStoryboard();
  const [mode, setMode] = useState<'brief' | 'video'>('brief');
  const [brief, setBrief] = useState('');
  const [format, setFormat] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [budget, setBudget] = useState('');
  const [seed, setSeed] = useState<{
    brandId: string;
    id: string;
    title: string;
  }>();
  const image = seed?.brandId === brandId ? seed : undefined;
  const [selected, setSelected] = useState<{
    brandId: string;
    id: string;
    title: string;
  }>();
  const validBudget =
    Number.isFinite(Number(budget)) &&
    Number(budget) > 0 &&
    Number(budget) <= 60;
  const video = selected?.brandId === brandId ? selected : undefined;
  const valid =
    mode === 'brief'
      ? (brief.trim().length > 0 || Boolean(image)) &&
        brief.trim().length <= 2000 &&
        validBudget
      : Boolean(video);
  async function submit() {
    if (!valid || isCreating) return;
    const input =
      mode === 'brief'
        ? {
            source: {
              kind: 'brief' as const,
              brief: brief.trim(),
              ...(image ? { seedImageAssetId: image.id } : {}),
            },
            planSettings: {
              format,
              videoModelKey: null,
              runtimeBudgetSeconds: Number(budget),
              styleReferenceAssetIds: [],
              cast: [],
            },
          }
        : {
            source: {
              kind: 'uploaded_video' as const,
              assetId: video?.id ?? '',
            },
          };
    try {
      const id = await create(input);
      if (!isCurrentResult(id)) return;
      router.push(
        href(`${APP_ROUTES.STUDIO.STORYBOARD}/${encodeURIComponent(id)}`),
      );
    } catch {
      /* The hook keeps the source and exposes the retryable error. */
    }
  }
  return (
    <Card label={translate('title')} description={translate('description')}>
      <div
        role="group"
        aria-label={translate('sourceAria')}
        className="mb-4 flex flex-wrap gap-2"
      >
        <Button
          label={translate('fromBrief')}
          aria-pressed={mode === 'brief'}
          variant={
            mode === 'brief' ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
          }
          disabled={isCreating}
          onClick={() => setMode('brief')}
        />
        <Button
          label={translate('remixTitle')}
          aria-pressed={mode === 'video'}
          variant={
            mode === 'video' ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
          }
          disabled={isCreating}
          onClick={() => setMode('video')}
        />
      </div>
      {mode === 'brief' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={translate('brief')}
            className="sm:col-span-2"
            helpText={translate('characterCount', { count: brief.length })}
          >
            <Textarea
              value={brief}
              maxLength={2000}
              disabled={isCreating}
              placeholder={translate('briefPlaceholder')}
              onChange={(event) => setBrief(event.target.value)}
            />
          </Field>
          <Field label={translate('format')}>
            <StoryboardSelect
              ariaLabel={translate('formatAria')}
              value={format}
              placeholder={translate('chooseFormat')}
              isDisabled={isCreating}
              options={['9:16', '16:9', '1:1'].map((value) => ({
                value,
                label: value,
              }))}
              onChange={(value) => {
                if (value === '9:16' || value === '16:9' || value === '1:1')
                  setFormat(value);
              }}
            />
          </Field>
          <Field
            label={translate('runtimeBudget')}
            helpText={translate('runtimeBudgetHelp')}
          >
            <Input
              type="number"
              min={1}
              max={60}
              value={budget}
              disabled={isCreating}
              onChange={(event) => setBudget(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button
              label={translate('chooseStartingImage')}
              variant={ButtonVariant.SECONDARY}
              disabled={isCreating}
              onClick={() =>
                openGallery({
                  category: IngredientCategory.IMAGE,
                  maxSelectableItems: 1,
                  title: translate('startingImage'),
                  onSelect: (items) => {
                    const item = items.find(
                      (candidate) =>
                        candidate.brandId === brandId && !candidate.isDeleted,
                    );
                    if (item && brandId)
                      setSeed({
                        brandId,
                        id: item.id,
                        title: storyboardAssetLabel(
                          item,
                          translate('startingImage'),
                        ),
                      });
                  },
                })
              }
            />
            {image ? (
              <Button
                label={`${image.title} ×`}
                ariaLabel={translate('removeAsset', { title: image.title })}
                variant={ButtonVariant.SECONDARY}
                disabled={isCreating}
                onClick={() => setSeed(undefined)}
              />
            ) : null}
            <p className="text-xs text-muted-foreground">
              {translate('startingImageHelp')}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p role="status" className="text-sm">
            {video?.title || translate('chooseOwnedVideo')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              label={translate('chooseFromLibrary')}
              variant={ButtonVariant.SECONDARY}
              disabled={isCreating}
              onClick={() =>
                openGallery({
                  category: IngredientCategory.VIDEO,
                  maxSelectableItems: 1,
                  title: translate('remixTitle'),
                  onSelect: (items) => {
                    const item = items.find(
                      (candidate) =>
                        candidate.brandId === brandId && !candidate.isDeleted,
                    );
                    if (item && brandId && 'brandId' in item)
                      setSelected({
                        brandId,
                        id: item.id,
                        title: storyboardAssetLabel(
                          item,
                          translate('uploadedVideo'),
                        ),
                      });
                  },
                })
              }
            />
            <Button
              label={translate('uploadVideo')}
              variant={ButtonVariant.SECONDARY}
              disabled={isCreating}
              onClick={() =>
                openUpload({
                  category: IngredientCategory.VIDEO,
                  isMultiple: false,
                  maxFiles: 1,
                  onComplete: (items) => {
                    const item = items.find(
                      (candidate) =>
                        'brandId' in candidate &&
                        candidate.brandId === brandId &&
                        !candidate.isDeleted,
                    );
                    if (item && brandId && 'brandId' in item)
                      setSelected({
                        brandId,
                        id: item.id,
                        title: storyboardAssetLabel(
                          item,
                          translate('uploadedVideo'),
                        ),
                      });
                  },
                })
              }
            />
            {video ? (
              <Button
                label={translate('clearVideo')}
                variant={ButtonVariant.SECONDARY}
                disabled={isCreating}
                onClick={() => setSelected(undefined)}
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {translate('videoHelp')}
          </p>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button
          label={
            isCreating
              ? translate('saving')
              : error
                ? translate('retrySaving')
                : translate('save')
          }
          disabled={isCreating || !valid}
          onClick={() => void submit()}
        />
      </div>
    </Card>
  );
}
