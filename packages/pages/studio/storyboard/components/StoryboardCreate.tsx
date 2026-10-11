'use client';

import { useBrandId } from '@contexts/user/brand-context/brand-context';
import {
  useGalleryModal,
  useUploadModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { StoryboardPreset } from '@genfeedai/props/studio/storyboard-presets.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StoryboardPresetChips from '@pages/studio/storyboard/components/StoryboardPresetChips';
import StoryboardReferencesPanel from '@pages/studio/storyboard/components/StoryboardReferencesPanel';
import { useCreateStoryboard } from '@pages/studio/storyboard/hooks/use-create-storyboard';
import { storyboardAssetLabel } from '@pages/studio/storyboard/utils/storyboard-plan';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import { Button } from '@ui/primitives/button';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarCompactSelect from '@ui/prompt-bars/components/toolbar/PromptBarCompactSelect';
import PromptBarSendButton from '@ui/prompt-bars/components/toolbar/PromptBarSendButton';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import PromptEditor from '@ui/prompt-editor/PromptEditor';
import { Paperclip } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const FORMAT_OPTIONS = ['9:16', '16:9', '1:1'].map((value) => ({
  label: value,
  value,
}));
const RUNTIME_BUDGET_SECONDS = [15, 30, 45, 60];
const MAX_BRIEF_LENGTH = 2000;
// The counter only appears once the brief is close to the limit.
const CHARACTER_COUNT_THRESHOLD = MAX_BRIEF_LENGTH * 0.8;

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
  // Presets may carry a runtime outside the quick picks; keep it selectable.
  const budgetSeconds = Number(budget);
  const budgetOptions = [
    ...new Set([
      ...RUNTIME_BUDGET_SECONDS,
      ...(validBudget ? [budgetSeconds] : []),
    ]),
  ]
    .sort((a, b) => a - b)
    .map((seconds) => ({
      label: `${seconds}${translate('secondsUnit')}`,
      value: String(seconds),
    }));
  const saveLabel = isCreating
    ? translate('saving')
    : error
      ? translate('retrySaving')
      : translate('save');
  const video = selected?.brandId === brandId ? selected : undefined;
  const valid =
    mode === 'brief'
      ? (brief.trim().length > 0 || Boolean(image)) &&
        brief.trim().length <= MAX_BRIEF_LENGTH &&
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
  function applyPreset(preset: StoryboardPreset) {
    setBrief(preset.brief);
    setFormat(preset.format);
    setBudget(String(preset.runtimeBudgetSeconds));
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
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
        <PromptBarContainer layoutMode="inflow" maxWidth="full">
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
            ) : null}
            <PromptBarToolbar
              density="compact"
              leading={
                mode === 'brief' ? (
                  <>
                    <Button
                      ariaLabel={translateWorkspace('references')}
                      icon={<Paperclip className="size-4" />}
                      isDisabled={isCreating}
                      onClick={chooseStartingImage}
                      size={ButtonSize.ICON}
                      tooltip={translateWorkspace('references')}
                      tooltipPosition="top"
                      variant={ButtonVariant.GHOST}
                      withWrapper={false}
                    />
                    <PromptBarCompactSelect
                      ariaLabel={translate('formatAria')}
                      density="compact"
                      isDisabled={isCreating}
                      options={FORMAT_OPTIONS}
                      value={format}
                      onChange={(value) => {
                        if (
                          value === '9:16' ||
                          value === '16:9' ||
                          value === '1:1'
                        )
                          setFormat(value);
                      }}
                    />
                    <PromptBarCompactSelect
                      ariaLabel={translate('runtimeBudget')}
                      density="compact"
                      isDisabled={isCreating}
                      options={budgetOptions}
                      value={budget}
                      onChange={setBudget}
                    />
                  </>
                ) : null
              }
              trailing={
                <PromptBarSendButton
                  ariaLabel={saveLabel}
                  density="compact"
                  isDisabled={isCreating || !valid}
                  isLoading={isCreating}
                  onClick={() => void submit()}
                  tooltip={saveLabel}
                />
              }
            />
            {mode === 'brief' && brief.length >= CHARACTER_COUNT_THRESHOLD ? (
              <p
                className={
                  brief.length > MAX_BRIEF_LENGTH
                    ? 'mt-2 text-xs text-destructive'
                    : 'mt-2 text-xs text-muted-foreground'
                }
              >
                {translate('characterCount', { count: brief.length })}
              </p>
            ) : null}
          </PromptBarComposer>
        </PromptBarContainer>
        {mode === 'video' ? (
          <p role="status" className="text-sm">
            {video?.title || translate('chooseOwnedVideo')}
          </p>
        ) : (
          <StoryboardPresetChips
            isDisabled={isCreating}
            onSelect={applyPreset}
          />
        )}
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
