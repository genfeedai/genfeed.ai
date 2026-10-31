'use client';

import {
  ButtonVariant,
  IngredientCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { displayedYouTubeAudience } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { saveDownloadBlob } from '@genfeedai/helpers/media/download/download.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { ReleaseGroupsService } from '@genfeedai/services/content/release-groups.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { YouTubePublishingSettingsProps } from '@/features/posts/props/youtube-publishing.props';

const COVER_WIDTH = 1080;

function readSetting(
  settings: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = settings?.[key];
  return typeof value === 'string' ? value : '';
}

export default function YouTubePublishingSettings({
  post,
  onSaved,
  isEmbedded = false,
}: YouTubePublishingSettingsProps) {
  const translate = useTranslations('ui.youtubePublishing');
  const savedPrivacy =
    displayedYouTubeAudience(
      post.visibility,
      post.targetSettings?.privacyStatus,
    ) ?? '';
  const savedMadeForKids = post.targetSettings?.madeForKids === true;
  const savedCoverText = readSetting(post.targetSettings, 'thumbnailText');
  const savedCoverFrame = readSetting(
    post.targetSettings,
    'thumbnailFrameSeconds',
  );
  const [privacy, setPrivacy] = useState(savedPrivacy);
  const [madeForKids, setMadeForKids] = useState(savedMadeForKids);
  const [coverText, setCoverText] = useState(savedCoverText);
  const [coverFrame, setCoverFrame] = useState(savedCoverFrame);
  const [syncedSettings, setSyncedSettings] = useState({
    coverFrame: savedCoverFrame,
    coverText: savedCoverText,
    madeForKids: savedMadeForKids,
    privacy: savedPrivacy,
  });
  // Adopt refreshed settings for the same post (adjusting state during render).
  if (
    syncedSettings.privacy !== savedPrivacy ||
    syncedSettings.madeForKids !== savedMadeForKids ||
    syncedSettings.coverText !== savedCoverText ||
    syncedSettings.coverFrame !== savedCoverFrame
  ) {
    if (privacy === syncedSettings.privacy) setPrivacy(savedPrivacy);
    if (madeForKids === syncedSettings.madeForKids)
      setMadeForKids(savedMadeForKids);
    if (coverText === syncedSettings.coverText) setCoverText(savedCoverText);
    if (coverFrame === syncedSettings.coverFrame)
      setCoverFrame(savedCoverFrame);
    setSyncedSettings({
      coverFrame: savedCoverFrame,
      coverText: savedCoverText,
      madeForKids: savedMadeForKids,
      privacy: savedPrivacy,
    });
  }
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const getReleasesService = useAuthedService((token) =>
    ReleaseGroupsService.getInstance(token),
  );
  const getVideosService = useAuthedService((token) =>
    VideosService.getInstance(token),
  );
  const selectedVisibility = Object.values(PostVisibility).find(
    (value) => value === privacy,
  );
  const brandId = post.brand?.id;
  const videoId = post.ingredients?.find(
    (ingredient) => ingredient.category === IngredientCategory.VIDEO,
  )?.id;
  // Preview state is tagged with the inputs it was rendered from, so a preview
  // for an earlier video, title or frame is never shown or downloaded.
  const coverKey = JSON.stringify([
    post.id,
    videoId,
    brandId,
    coverText.trim(),
    coverFrame.trim(),
  ]);
  const [renderedCover, setRenderedCover] = useState<{
    blob: Blob;
    key: string;
    url: string;
  } | null>(null);
  const [renderingKey, setRenderingKey] = useState<string | null>(null);
  const [renderedError, setRenderedError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const renderController = useRef<AbortController | null>(null);
  const cover = renderedCover?.key === coverKey ? renderedCover : null;
  const isRendering = renderingKey === coverKey;
  const coverError =
    renderedError?.key === coverKey ? renderedError.message : null;

  useEffect(() => {
    return () => renderController.current?.abort();
  }, []);

  useEffect(() => {
    if (!renderedCover) return;
    return () => URL.revokeObjectURL(renderedCover.url);
  }, [renderedCover]);

  function coverFrameSeconds(): number | undefined {
    const seconds = Number(coverFrame);
    return coverFrame.trim() !== '' && Number.isFinite(seconds) && seconds >= 0
      ? seconds
      : undefined;
  }

  async function previewCover() {
    if (!videoId) return;
    renderController.current?.abort();
    const controller = new AbortController();
    renderController.current = controller;
    const key = coverKey;
    setRenderingKey(key);
    setRenderedError(null);
    try {
      const service = await getVideosService();
      const blob = await service.getCover(
        videoId,
        {
          brandId,
          timeInSeconds: coverFrameSeconds(),
          title: coverText.trim() || undefined,
          width: COVER_WIDTH,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setRenderedCover({ blob, key, url: URL.createObjectURL(blob) });
    } catch {
      if (!controller.signal.aborted)
        setRenderedError({ key, message: translate('coverFailed') });
    } finally {
      setRenderingKey((current) => (current === key ? null : current));
    }
  }

  async function save() {
    if (!selectedVisibility) return;
    setIsSaving(true);
    setError(null);
    try {
      const service = await getReleasesService();
      const release = await service.ensureFromPost(post.id);
      await service.updateTarget(release.id, post.id, {
        ...(post.targetExecutionState === TargetExecutionState.DRAFT
          ? { executionState: TargetExecutionState.DRAFT }
          : {}),
        settings: {
          ...post.targetSettings,
          madeForKids,
          privacyStatus: selectedVisibility,
          thumbnailFrameSeconds: coverFrame.trim() || undefined,
          thumbnailText: coverText.trim() || undefined,
        },
        visibility: selectedVisibility,
      });
      NotificationsService.getInstance().success(translate('saved'));
      try {
        await onSaved?.();
      } catch {
        NotificationsService.getInstance().warning(translate('refreshFailed'));
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : translate('saveFailed'),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-label={translate('sectionLabel')}
      className={cn(
        'space-y-3',
        !isEmbedded && 'rounded-lg border border-border p-4',
      )}
    >
      {isEmbedded ? null : (
        <h3 className="text-sm font-semibold">{translate('title')}</h3>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <FormControl label={translate('privacy')}>
        <SelectField
          name="youtubePrivacy"
          value={privacy}
          isDisabled={isSaving}
          onChange={(event) => setPrivacy(event.target.value)}
        >
          <option value="">{translate('choosePrivacy')}</option>
          <option value={PostVisibility.PRIVATE}>{translate('private')}</option>
          <option value={PostVisibility.UNLISTED}>
            {translate('unlisted')}
          </option>
          <option value={PostVisibility.PUBLIC}>{translate('public')}</option>
        </SelectField>
      </FormControl>
      <Checkbox
        label={translate('madeForKids')}
        isChecked={madeForKids}
        isDisabled={isSaving}
        onChange={(event) => setMadeForKids(event.target.checked)}
      />
      <Input
        label={translate('coverTitle')}
        name="youtubeCoverTitle"
        value={coverText}
        maxLength={120}
        isDisabled={isSaving}
        onChange={(event) => {
          renderController.current?.abort();
          setCoverText(event.target.value);
        }}
      />
      <Input
        label={translate('coverFrame')}
        name="youtubeCoverFrame"
        type="number"
        min={0}
        step="0.5"
        value={coverFrame}
        isDisabled={isSaving}
        onChange={(event) => {
          renderController.current?.abort();
          setCoverFrame(event.target.value);
        }}
      />
      <p className="text-xs text-muted-foreground">{translate('coverHint')}</p>
      {videoId ? (
        <Button
          label={isRendering ? translate('rendering') : translate('preview')}
          variant={ButtonVariant.SECONDARY}
          isDisabled={isRendering}
          isLoading={isRendering}
          onClick={() => void previewCover()}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate('coverNeedsVideo')}
        </p>
      )}
      {coverError ? (
        <p role="alert" className="text-sm text-destructive">
          {coverError}
        </p>
      ) : null}
      {cover ? (
        <div className="space-y-2">
          <Image
            src={cover.url}
            alt={translate('coverPreviewAlt')}
            width={COVER_WIDTH / 4}
            height={(COVER_WIDTH / 4) * (16 / 9)}
            unoptimized
            className="h-auto w-40 rounded-lg border border-border"
          />
          <Button
            label={translate('downloadCover')}
            variant={ButtonVariant.SECONDARY}
            onClick={() =>
              saveDownloadBlob(cover.blob, `youtube-cover-${post.id}.jpg`)
            }
          />
        </div>
      ) : null}
      <Button
        label={isSaving ? translate('saving') : translate('save')}
        variant={ButtonVariant.SECONDARY}
        isDisabled={!selectedVisibility || isSaving}
        isLoading={isSaving}
        onClick={() => void save()}
      />
    </section>
  );
}
