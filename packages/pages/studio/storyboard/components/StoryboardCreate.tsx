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
import { useState } from 'react';

/** Selection/upload saves media only; creating a draft never dispatches paid work. */
export default function StoryboardCreate() {
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
    <Card
      label="Create a storyboard"
      description="Save your brief or video, then review a credit quote before generating."
    >
      <div
        role="group"
        aria-label="Storyboard source"
        className="mb-4 flex flex-wrap gap-2"
      >
        <Button
          label="From a brief"
          aria-pressed={mode === 'brief'}
          variant={
            mode === 'brief' ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY
          }
          disabled={isCreating}
          onClick={() => setMode('brief')}
        />
        <Button
          label="Remix a video"
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
            label="Brief"
            className="sm:col-span-2"
            helpText={`${brief.length}/2,000 characters`}
          >
            <Textarea
              value={brief}
              maxLength={2000}
              disabled={isCreating}
              placeholder="Describe the video you want to make"
              onChange={(event) => setBrief(event.target.value)}
            />
          </Field>
          <Field label="Format">
            <StoryboardSelect
              ariaLabel="Storyboard format"
              value={format}
              placeholder="Choose format"
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
            label="Runtime budget (seconds)"
            helpText="Choose up to 60 seconds."
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
              label="Choose a starting image"
              variant={ButtonVariant.SECONDARY}
              disabled={isCreating}
              onClick={() =>
                openGallery({
                  category: IngredientCategory.IMAGE,
                  maxSelectableItems: 1,
                  title: 'Starting image',
                  onSelect: (items) => {
                    const item = items.find(
                      (candidate) =>
                        candidate.brandId === brandId && !candidate.isDeleted,
                    );
                    if (item && brandId)
                      setSeed({
                        brandId,
                        id: item.id,
                        title: storyboardAssetLabel(item, 'Starting image'),
                      });
                  },
                })
              }
            />
            {image ? (
              <Button
                label={`${image.title} ×`}
                ariaLabel={`Remove ${image.title}`}
                variant={ButtonVariant.SECONDARY}
                disabled={isCreating}
                onClick={() => setSeed(undefined)}
              />
            ) : null}
            <p className="text-xs text-muted-foreground">
              A starting image can replace the brief. It is saved as a reference
              and requires generated stills before approval.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p role="status" className="text-sm">
            {video?.title ||
              'Choose an owned video up to 60 seconds and 100 MiB.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              label="Choose from Library"
              variant={ButtonVariant.SECONDARY}
              disabled={isCreating}
              onClick={() =>
                openGallery({
                  category: IngredientCategory.VIDEO,
                  maxSelectableItems: 1,
                  title: 'Remix a video',
                  onSelect: (items) => {
                    const item = items.find(
                      (candidate) =>
                        candidate.brandId === brandId && !candidate.isDeleted,
                    );
                    if (item && brandId && 'brandId' in item)
                      setSelected({
                        brandId,
                        id: item.id,
                        title: storyboardAssetLabel(item, 'Uploaded video'),
                      });
                  },
                })
              }
            />
            <Button
              label="Upload a video"
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
                        title: storyboardAssetLabel(item, 'Uploaded video'),
                      });
                  },
                })
              }
            />
            {video ? (
              <Button
                label="Clear video"
                variant={ButtonVariant.SECONDARY}
                disabled={isCreating}
                onClick={() => setSelected(undefined)}
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Uploading or selecting a video does not create a run. Its ownership,
            duration, and size are validated when you continue.
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
              ? 'Saving…'
              : error
                ? 'Retry saving storyboard'
                : 'Save storyboard'
          }
          disabled={isCreating || !valid}
          onClick={() => void submit()}
        />
      </div>
    </Card>
  );
}
