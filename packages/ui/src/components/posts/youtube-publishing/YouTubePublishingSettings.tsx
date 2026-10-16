'use client';

import {
  ButtonVariant,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { displayedYouTubeAudience } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { YouTubePublishingSettingsProps } from '@genfeedai/props/components/youtube-publishing.props';
import { ReleaseGroupsService } from '@genfeedai/services/content/release-groups.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { SelectField } from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
  const [privacy, setPrivacy] = useState(savedPrivacy);
  const [madeForKids, setMadeForKids] = useState(savedMadeForKids);
  const [syncedSettings, setSyncedSettings] = useState({
    madeForKids: savedMadeForKids,
    privacy: savedPrivacy,
  });
  // Adopt refreshed settings for the same post (adjusting state during render).
  if (
    syncedSettings.privacy !== savedPrivacy ||
    syncedSettings.madeForKids !== savedMadeForKids
  ) {
    if (privacy === syncedSettings.privacy) setPrivacy(savedPrivacy);
    if (madeForKids === syncedSettings.madeForKids)
      setMadeForKids(savedMadeForKids);
    setSyncedSettings({ madeForKids: savedMadeForKids, privacy: savedPrivacy });
  }
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const getReleasesService = useAuthedService((token) =>
    ReleaseGroupsService.getInstance(token),
  );
  const selectedVisibility = Object.values(PostVisibility).find(
    (value) => value === privacy,
  );

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
        <p role="alert" className="text-sm text-error">
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
