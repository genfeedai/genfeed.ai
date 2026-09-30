'use client';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
import { ContentLibraryPicker } from '@genfeedai/agent/components/ContentLibraryPicker';
import {
  ButtonSize,
  ButtonVariant,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { BrandRemixStoryboardScene } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type { Video } from '@genfeedai/models/ingredients/video.model';
import type { StoryboardRunScenesProps } from '@genfeedai/props/studio/storyboard.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAvatarImages } from '@hooks/data/ingredients/use-avatar-images/use-avatar-images';
import { useVoiceCatalog } from '@pages/library/voices/hooks/use-voice-catalog';
import StoryboardAnimatic from '@pages/studio/storyboard/components/StoryboardAnimatic';
import StoryboardSelect from '@pages/studio/storyboard/components/StoryboardSelect';
import { useStoryboardAssets } from '@pages/studio/storyboard/hooks/use-storyboard-assets';
import { getStoryboardScenePreview } from '@pages/studio/storyboard/utils/storyboard-scene-preview';
import { VideosService } from '@services/ingredients/videos.service';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function StoryboardRunScenes({
  run,
  actions,
  isWorking,
}: StoryboardRunScenesProps) {
  const t = useTranslations('pages.studioStoryboard.scenes');
  const { organizationId } = useBrand();
  const { avatars, isLoading: avatarsLoading } =
    useAvatarImages(organizationId);
  const { voices, isLoading: voicesLoading } = useVoiceCatalog({
    isActive: true,
    status: [
      IngredientStatus.UPLOADED,
      IngredientStatus.GENERATED,
      IngredientStatus.VALIDATED,
    ],
  });
  const avatarOptions = avatars
    .filter(
      (avatar) =>
        avatar.brandId === run.brandId &&
        ['UPLOADED', 'GENERATED', 'VALIDATED'].includes(avatar.status ?? ''),
    )
    .map((avatar) => ({
      value: avatar.id,
      label:
        getIngredientDisplayLabel(avatar) !== avatar.id
          ? getIngredientDisplayLabel(avatar)
          : t('avatar'),
    }));
  const voiceOptions = voices
    .filter(
      (voice) =>
        voice.brandId === run.brandId &&
        (voice.externalVoiceId || voice.sampleAudioUrl),
    )
    .map((voice) => ({
      value: voice.id,
      label:
        getIngredientDisplayLabel(voice) !== voice.id
          ? getIngredientDisplayLabel(voice)
          : t('voice'),
    }));
  const [storyboard, setStoryboard] = useState(run.concept?.storyboard ?? []);
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [libraryError, setLibraryError] = useState<string>();
  const getVideos = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );
  const pipeline = run.scenePipeline;
  const sceneAssets = useStoryboardAssets(
    `${run.id}:${run.revision}`,
    run.brandId,
    Object.values(pipeline?.scenes ?? {})
      .flatMap((scene) => [
        ...(scene.video.state === 'ready' && scene.video.assetId
          ? [{ id: scene.video.assetId, kind: 'video' as const }]
          : []),
        ...(scene.image.state === 'ready' && scene.image.assetId
          ? [{ id: scene.image.assetId, kind: 'image' as const }]
          : []),
      ])
      .concat(
        (pipeline?.analysis?.keyframes ?? []).map((frame) => ({
          id: frame.assetId,
          kind: 'image' as const,
        })),
      ),
  );
  const runAssets = useStoryboardAssets(
    `${run.id}:${run.revision}`,
    run.brandId,
    [
      ...(pipeline?.state === 'ready' && pipeline.assembly?.assetId
        ? [{ id: pipeline.assembly.assetId, kind: 'video' as const }]
        : []),
      ...(run.analysisSource?.assetId
        ? [{ id: run.analysisSource.assetId, kind: 'video' as const }]
        : []),
    ],
  );
  const preview =
    pipeline?.state === 'ready'
      ? runAssets[`video:${pipeline.assembly?.assetId}`]?.cdnUrl
      : undefined;
  const source = runAssets[`video:${run.analysisSource?.assetId}`];
  const sourcePreview = source?.cdnUrl;
  const sourceLabel =
    source && getIngredientDisplayLabel(source) !== source.id
      ? getIngredientDisplayLabel(source)
      : t('analysisPreview');
  const active =
    pipeline &&
    ['analysing', 'generating', 'assembling'].includes(pipeline.state);
  const immutable = Boolean(
    run.review ||
      run.reviewClaim ||
      [
        'in_review',
        'approved',
        'paid_draft_ready',
        'paid_draft_creating',
      ].includes(run.phase),
  );
  const disabled = isWorking || Boolean(active) || immutable;
  useEffect(() => {
    setStoryboard(run.concept?.storyboard ?? []);
  }, [run.concept]);
  const libraryErrorLabel = t('libraryError');
  useEffect(() => {
    const controller = new AbortController();
    setLibraryError(undefined);
    setVideos([]);
    const load = async () => {
      try {
        const service = await getVideos();
        if (isPickerOpen) {
          const list = await service.findAll(
            {
              brandId: run.brandId,
              scope: 'USER',
              status: ['UPLOADED', 'GENERATED', 'VALIDATED'],
              limit: 100,
            },
            controller.signal,
          );
          if (!controller.signal.aborted)
            setVideos(
              list.filter(
                (video) =>
                  ['UPLOADED', 'GENERATED', 'VALIDATED'].includes(
                    video.status ?? '',
                  ) &&
                  video.scope === 'USER' &&
                  video.brandId === run.brandId,
              ),
            );
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setLibraryError(
            error instanceof Error ? error.message : libraryErrorLabel,
          );
      }
    };
    if (isPickerOpen) void load();
    return () => controller.abort();
  }, [getVideos, isPickerOpen, run.brandId, libraryErrorLabel]);
  const patch = (index: number, edit: Partial<BrandRemixStoryboardScene>) =>
    setStoryboard((current) =>
      current.map((scene, position) =>
        position === index ? { ...scene, ...edit } : scene,
      ),
    );
  const move = (index: number, delta: number) =>
    setStoryboard((current) => {
      const copy = [...current];
      const other = index + delta;
      if (other < 0 || other >= copy.length) return current;
      [copy[index], copy[other]] = [copy[other], copy[index]];
      return copy.map((scene, position) => ({
        ...scene,
        ordinal: position + 1,
      }));
    });
  const dirty =
    JSON.stringify(storyboard) !==
    JSON.stringify(run.concept?.storyboard ?? []);
  const hasIncompleteIdentity = storyboard.some(
    (scene) =>
      scene.identity &&
      (!scene.identity.avatarAssetId || !scene.identity.speechVoiceId),
  );
  const canCancel =
    Boolean(pipeline?.operation) &&
    !immutable &&
    (Boolean(active) || pipeline?.state === 'partial_failure');
  const isRecordingAcceptedWork = Object.values(pipeline?.scenes ?? {}).some(
    (scene) =>
      [scene.image.state, scene.video.state].some(
        (state) => state === 'claimed' || state === 'submitted',
      ),
  );
  const canResume =
    Boolean(pipeline?.operation) &&
    !immutable &&
    (pipeline?.state === 'partial_failure' ||
      (pipeline?.state === 'cancelled' && !isRecordingAcceptedWork));
  return (
    <section
      aria-label={t('title')}
      className="space-y-4 border-t border-border pt-4"
    >
      <h3 className="font-semibold">{t('title')}</h3>
      <p className="text-xs text-muted-foreground">{t('limits')}</p>
      <p className="text-xs">{t('provenance')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          label={t('attach')}
          isDisabled={disabled}
          onClick={() => setPickerOpen(true)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
        {run.analysisSource ? (
          <Button
            label={t('remove')}
            isDisabled={disabled}
            onClick={() => void actions.attachSceneSource(null)}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
          />
        ) : null}
      </div>
      {run.analysisSource ? (
        <p className="text-xs">
          {t('selectedSource', { id: sourceLabel ?? t('analysisPreview') })}
        </p>
      ) : null}
      {sourcePreview ? (
        <VideoPlayer
          src={sourcePreview}
          ariaLabel={t('analysisPreview')}
          className="max-w-sm"
        />
      ) : null}
      {libraryError ? <p role="alert">{libraryError}</p> : null}
      <ContentLibraryPicker
        isOpen={isPickerOpen}
        onOpenChange={setPickerOpen}
        items={videos.map((video) => ({
          brandId: video.brandId ?? null,
          id: video.id,
          contentType: 'video',
          contentTitle:
            getIngredientDisplayLabel(video) !== video.id
              ? getIngredientDisplayLabel(video)
              : t('analysisPreview'),
          thumbnailUrl: video.thumbnailUrl,
        }))}
        onSelect={(item) => {
          setPickerOpen(false);
          void actions.attachSceneSource(item.id);
        }}
      />
      <div role="status" aria-live="polite">
        {pipeline
          ? t('status', { state: pipeline.state })
          : t('awaitingAnalysis')}
      </div>
      {pipeline?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {pipeline.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          label={t('analyze')}
          isDisabled={disabled || dirty}
          onClick={() => void actions.quoteScenes({ operation: 'analysis' })}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
        <Button
          label={t('quote')}
          isDisabled={disabled || dirty || storyboard.length < 2}
          onClick={() => void actions.quoteScenes({ operation: 'generate' })}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
        />
        {canCancel ? (
          <Button
            label={t('cancel')}
            isDisabled={isWorking}
            onClick={() => void actions.cancelScenes()}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        ) : null}
        {canResume ? (
          <Button
            label={t('resume')}
            isDisabled={isWorking}
            onClick={() => void actions.resumeScenes()}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          />
        ) : null}
      </div>
      {pipeline?.quote && pipeline.state === 'quoted' ? (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="font-medium">
            {t('total', { credits: pipeline.quote.total })}
          </p>
          <p className="text-xs">
            {t('expires', { time: pipeline.quote.expiresAt })}
          </p>
          <ul className="space-y-1 text-xs">
            {pipeline.quote.items.map((line) => (
              <li key={line.key}>
                {line.sceneId
                  ? `${t('scene', { ordinal: storyboard.findIndex((scene) => scene.id === line.sceneId) + 1 })} · `
                  : ''}
                {line.stage} · {line.model} · {line.billingMode} ·{' '}
                {line.credits}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t('vendorCosts')}</p>
          <Button
            label={t('accept')}
            isDisabled={
              disabled ||
              dirty ||
              Date.parse(pipeline.quote.expiresAt) <= Date.now()
            }
            onClick={() => void actions.executeScenes()}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
          />
        </div>
      ) : null}
      <StoryboardAnimatic
        scope={`${run.id}:${run.revision}:${JSON.stringify(storyboard)}`}
        shots={storyboard.map((scene) => {
          const image = scene.id
            ? pipeline?.scenes[scene.id]?.image
            : undefined;
          return {
            id: scene.id ?? `shot-${scene.ordinal}`,
            ordinal: scene.ordinal,
            durationSeconds: scene.durationSeconds ?? null,
            dialogue: scene.narration,
            stillUrl:
              image?.state === 'ready' && image.assetId
                ? (sceneAssets[`image:${image.assetId}`]?.cdnUrl ?? undefined)
                : undefined,
          };
        })}
      />
      {storyboard.map((scene, index) => {
        const progress = scene.id ? pipeline?.scenes[scene.id] : undefined;
        const media = getStoryboardScenePreview(scene, pipeline, sceneAssets);
        return (
          <div
            key={scene.id ?? scene.ordinal}
            className="space-y-3 border-t border-border pt-3"
          >
            <h4 className="text-sm font-medium">
              {t('scene', { ordinal: index + 1 })}
            </h4>
            <div className="max-w-sm">
              {media?.url ? (
                <AgentMediaArtifactPreview
                  assets={[
                    {
                      kind: media.kind,
                      url: media.url,
                      title: t('scene', { ordinal: index + 1 }),
                    },
                  ]}
                  displayMode="featured"
                />
              ) : (
                <p className="flex aspect-video items-center justify-center rounded-md border border-border text-xs text-muted-foreground">
                  {t.has?.('previewUnavailable')
                    ? t('previewUnavailable')
                    : 'Preview unavailable'}
                </p>
              )}
              {media?.isSourceFrame ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.has?.('sourceFrame') ? t('sourceFrame') : 'Source frame'}
                </p>
              ) : null}
            </div>
            {scene.sourceObservation ? (
              <p className="text-xs text-muted-foreground">
                {t('observation', {
                  start: scene.sourceObservation.startSeconds,
                  end: scene.sourceObservation.endSeconds,
                  keyframe: scene.sourceObservation.keyframeSeconds,
                })}{' '}
                {scene.sourceObservation.semanticIntent}
              </p>
            ) : null}
            <Field label={t('visual')}>
              {disabled ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  {scene.visualIntent}
                </p>
              ) : (
                <Textarea
                  value={scene.visualIntent}
                  maxLength={1000}
                  rows={3}
                  onChange={(event) =>
                    patch(index, { visualIntent: event.target.value })
                  }
                />
              )}
            </Field>
            <Field label={t('narration')}>
              {disabled ? (
                <p className="whitespace-pre-wrap break-words text-sm">
                  {scene.narration || '—'}
                </p>
              ) : (
                <Textarea
                  value={scene.narration ?? ''}
                  maxLength={1000}
                  rows={3}
                  onChange={(event) =>
                    patch(index, { narration: event.target.value })
                  }
                />
              )}
            </Field>
            <Input
              label={t('duration')}
              value={String(scene.durationSeconds ?? 5)}
              disabled={disabled}
              type="number"
              min={3}
              max={15}
              onChange={(event) =>
                patch(index, { durationSeconds: Number(event.target.value) })
              }
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <StoryboardSelect
                ariaLabel={t('avatar')}
                placeholder={t('avatar')}
                value={scene.identity?.avatarAssetId ?? ''}
                options={avatarOptions}
                isDisabled={disabled || avatarsLoading}
                onChange={(value) =>
                  patch(index, {
                    identity: {
                      avatarAssetId: value ?? '',
                      speechVoiceId: scene.identity?.speechVoiceId ?? '',
                    },
                  })
                }
              />
              <StoryboardSelect
                ariaLabel={t('voice')}
                placeholder={t('voice')}
                value={scene.identity?.speechVoiceId ?? ''}
                options={voiceOptions}
                isDisabled={disabled || voicesLoading}
                onChange={(value) =>
                  patch(index, {
                    identity: {
                      avatarAssetId: scene.identity?.avatarAssetId ?? '',
                      speechVoiceId: value ?? '',
                    },
                  })
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                label={t('up')}
                isDisabled={disabled || index === 0}
                onClick={() => move(index, -1)}
                size={ButtonSize.XS}
                variant={ButtonVariant.GHOST}
              />
              <Button
                label={t('down')}
                isDisabled={disabled || index === storyboard.length - 1}
                onClick={() => move(index, 1)}
                size={ButtonSize.XS}
                variant={ButtonVariant.GHOST}
              />
              <Button
                label={t('drop')}
                isDisabled={disabled || storyboard.length <= 2}
                onClick={() =>
                  setStoryboard(
                    storyboard
                      .filter((_, position) => position !== index)
                      .map((item, position) => ({
                        ...item,
                        ordinal: position + 1,
                      })),
                  )
                }
                size={ButtonSize.XS}
                variant={ButtonVariant.GHOST}
              />
              <Button
                label={t('defaultIdentity')}
                isDisabled={disabled}
                onClick={() => patch(index, { identity: undefined })}
                size={ButtonSize.XS}
                variant={ButtonVariant.GHOST}
              />
              {progress && scene.id ? (
                <>
                  <Button
                    label={t('repairVideo')}
                    isDisabled={disabled || dirty}
                    onClick={() =>
                      void actions.quoteScenes({
                        operation: 'repair',
                        sceneId: scene.id,
                        repairStage: 'video',
                      })
                    }
                    size={ButtonSize.XS}
                    variant={ButtonVariant.SECONDARY}
                  />
                  <Button
                    label={t('repairImage')}
                    isDisabled={disabled || dirty}
                    onClick={() =>
                      void actions.quoteScenes({
                        operation: 'repair',
                        sceneId: scene.id,
                        repairStage: 'image',
                      })
                    }
                    size={ButtonSize.XS}
                    variant={ButtonVariant.SECONDARY}
                  />
                </>
              ) : null}
            </div>
            {progress ? (
              <p role="status" className="text-xs">
                {t('progress', {
                  image: progress.image.state,
                  video: progress.video.state,
                  planned: scene.durationSeconds ?? 0,
                  actual: progress.actualDurationSeconds ?? 0,
                })}{' '}
                {progress.image.error ?? progress.video.error}
              </p>
            ) : null}
          </div>
        );
      })}
      {hasIncompleteIdentity ? (
        <p className="text-xs text-destructive">{t('identityPairRequired')}</p>
      ) : null}
      {dirty ? (
        <p role="status" className="text-xs text-muted-foreground">
          {t.has?.('unsavedChanges') ? t('unsavedChanges') : 'Unsaved changes'}
        </p>
      ) : null}
      <Button
        label={t('save')}
        isDisabled={disabled || !dirty || hasIncompleteIdentity}
        onClick={() => void actions.saveScenes({ concept: { storyboard } })}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
      />
      {preview ? (
        <VideoPlayer
          src={preview}
          ariaLabel={t('outputPreview')}
          className="max-w-lg"
        />
      ) : null}
    </section>
  );
}
