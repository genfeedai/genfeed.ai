'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import {
  useGalleryModal,
  useUploadModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import { ButtonVariant, IngredientCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StoryboardReferencesPanel from '@pages/studio/storyboard/components/StoryboardReferencesPanel';
import StoryboardSelect from '@pages/studio/storyboard/components/StoryboardSelect';
import { useCreateStoryboard } from '@pages/studio/storyboard/hooks/use-create-storyboard';
import { storyboardAssetLabel } from '@pages/studio/storyboard/utils/storyboard-plan';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { Paperclip } from 'lucide-react';
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
  const [budget, setBudget] = useState('30');
  const [seed, setSeed] = useState<{
    brandId: string;
    id: string;
    title: string;
    url?: string;
  }>();
  const image = seed?.brandId === brandId ? seed : undefined;
  const [styleReferences, setStyleReferences] = useState<
    NonNullable<typeof seed>[]
  >([]);
  const styles = styleReferences.filter(
    (reference) => reference.brandId === brandId,
  );
  const translateWorkspace = useTranslations(
    'pages.studioStoryboard.workspace',
  );
  const translatePlan = useTranslations('pages.studioStoryboard.plan');
  const [selected, setSelected] = useState<{
    brandId: string;
    id: string;
    title: string;
    url?: string;
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
  function chooseStartingImage() {
    openGallery({
      category: IngredientCategory.IMAGE,
      format,
      maxSelectableItems: 1,
      title: translate('startingImage'),
      onSelect: (items) => {
        const item = items.find(
          (candidate) => candidate.brandId === brandId && !candidate.isDeleted,
        );
        if (item && brandId)
          setSeed({
            brandId,
            id: item.id,
            url: item.cdnUrl ?? undefined,
            title: storyboardAssetLabel(item, translate('startingImage')),
          });
      },
    });
  }
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
              styleReferenceAssetIds: styles.map((reference) => reference.id),
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
    <div className="grid min-h-[calc(100dvh-12rem)] gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <div
          role="group"
          aria-label={translate('sourceAria')}
          className="flex flex-wrap gap-2"
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
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
          <h2 className="text-xl font-medium">
            {translateWorkspace('emptyTitle')}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {translateWorkspace('emptyDescription')}
          </p>
          {mode === 'video' ? (
            <p role="status" className="text-sm">
              {video?.title || translate('chooseOwnedVideo')}
            </p>
          ) : null}
        </div>
        <div className="sticky bottom-4 z-10 mt-auto">
          <PromptBarComposer
            data-testid="storyboard-composer"
            density="compact"
            banner={
              error ? (
                <p role="alert" className="p-3 text-sm text-destructive">
                  {error}
                </p>
              ) : undefined
            }
          >
            {mode === 'brief' ? (
              <PromptEditor
                ariaLabel={translate('brief')}
                value={brief}
                isDisabled={isCreating}
                placeholder={translate('briefPlaceholder')}
                onValueChange={setBrief}
                onSubmit={() => void submit()}
                className="min-h-16"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {translate('videoHelp')}
              </p>
            )}
            <PromptBarToolbar
              leading={
                mode === 'brief' ? (
                  <>
                    <Button
                      ariaLabel={translateWorkspace('references')}
                      icon={<Paperclip className="size-4" />}
                      variant={ButtonVariant.GHOST}
                      onClick={chooseStartingImage}
                      disabled={isCreating}
                    />
                    <div className="w-28">
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
                          if (
                            value === '9:16' ||
                            value === '16:9' ||
                            value === '1:1'
                          )
                            setFormat(value);
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        aria-label={translate('runtimeBudget')}
                        className="w-20"
                        type="number"
                        min={1}
                        max={60}
                        value={budget}
                        disabled={isCreating}
                        onChange={(event) => setBudget(event.target.value)}
                      />
                      <span
                        aria-hidden
                        className="text-xs text-muted-foreground"
                      >
                        {translate('secondsUnit')}
                      </span>
                    </div>
                  </>
                ) : null
              }
              trailing={
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
              }
            />
            {mode === 'brief' ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {translate('characterCount', { count: brief.length })}
              </p>
            ) : null}
          </PromptBarComposer>
          <p className="mt-2 text-xs text-muted-foreground">
            {translate('description')}
          </p>
        </div>
      </div>
      <StoryboardReferencesPanel
        references={[
          ...(mode === 'brief' && image
            ? [
                {
                  id: `seed:${image.id}`,
                  title: image.title,
                  kind: 'image' as const,
                  url: image.url,
                  group: translate('startingImage'),
                  onRemove: () => setSeed(undefined),
                },
              ]
            : []),
          ...(mode === 'brief'
            ? styles.map((reference) => ({
                id: `style:${reference.id}`,
                title: reference.title,
                kind: 'image' as const,
                url: reference.url,
                group: translateWorkspace('styles'),
                onRemove: () =>
                  setStyleReferences((current) =>
                    current.filter(
                      (item) =>
                        item.id !== reference.id || item.brandId !== brandId,
                    ),
                  ),
              }))
            : []),
          ...(mode === 'video' && video
            ? [
                {
                  id: `video:${video.id}`,
                  title: video.title,
                  kind: 'video' as const,
                  url: video.url,
                  group: translate('uploadedVideo'),
                  onRemove: () => setSelected(undefined),
                },
              ]
            : []),
        ]}
        actions={
          mode === 'brief' ? (
            <>
              <Button
                label={translate('chooseStartingImage')}
                variant={ButtonVariant.SECONDARY}
                disabled={isCreating}
                onClick={chooseStartingImage}
              />
              <Button
                label={translatePlan('addStyleReferences')}
                variant={ButtonVariant.SECONDARY}
                disabled={isCreating || styles.length >= 20}
                onClick={() =>
                  openGallery({
                    category: IngredientCategory.IMAGE,
                    format,
                    maxSelectableItems: 20 - styles.length,
                    title: translateWorkspace('styles'),
                    onSelect: (items) => {
                      const selected = items.filter(
                        (item) => item.brandId === brandId && !item.isDeleted,
                      );
                      if (!brandId) return;
                      setStyleReferences((current) =>
                        [
                          ...new Map(
                            [
                              ...current.filter(
                                (item) => item.brandId === brandId,
                              ),
                              ...selected.map((item) => ({
                                brandId,
                                id: item.id,
                                title: storyboardAssetLabel(
                                  item,
                                  translateWorkspace('styles'),
                                ),
                                url: item.cdnUrl ?? undefined,
                              })),
                            ].map((item) => [item.id, item]),
                          ).values(),
                        ].slice(0, 20),
                      );
                    },
                  })
                }
              />
            </>
          ) : (
            <>
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
                          url: item.cdnUrl ?? undefined,
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
                          url: item.cdnUrl ?? undefined,
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
            </>
          )
        }
      />
    </div>
  );
}
