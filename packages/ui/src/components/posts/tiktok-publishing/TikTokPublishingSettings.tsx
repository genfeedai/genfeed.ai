'use client';

import {
  ButtonVariant,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  readTikTokPublishingCapabilities,
  TIKTOK_PRIVACY_OPTIONS,
  type TikTokPublishingCapabilities,
  validateTikTokPublishingSettings,
} from '@genfeedai/contracts/api-types/contracts';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { TikTokPublishingSettingsProps } from '@genfeedai/props/components/tiktok-publishing.props';
import { ReleaseGroupsService } from '@genfeedai/services/content/release-groups.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { ServicesService } from '@genfeedai/services/external/services.service';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import FormControl from '@ui/primitives/field';
import { SelectField } from '@ui/primitives/select';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function TikTokPublishingSettings({
  post,
  onSaved,
  onReadinessChange,
}: TikTokPublishingSettingsProps) {
  const [capabilities, setCapabilities] =
    useState<TikTokPublishingCapabilities | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>(() =>
    post.targetSettings?.musicUsageAccepted === true
      ? { ...post.targetSettings }
      : {},
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const getTikTokService = useAuthedService(
    (token) => new ServicesService('tiktok', token),
  );
  const getReleasesService = useAuthedService((token) =>
    ReleaseGroupsService.getInstance(token),
  );
  const credentialId = post.credentialId ?? post.credential?.id;

  const refreshCapabilities = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);
    setCapabilities(null);
    setError(null);
    try {
      if (!credentialId)
        throw new Error('Connect a TikTok account before posting.');
      const service = await getTikTokService();
      if (controller.signal.aborted) return;
      const credential = await service.refreshAuthorizedSignals(
        credentialId,
        controller.signal,
      );
      const latest = readTikTokPublishingCapabilities(credential.warmupSignals);
      if (!latest)
        throw new Error(
          'TikTok posting capabilities are unavailable. Reconnect the account or try again later.',
        );
      if (!controller.signal.aborted) setCapabilities(latest);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Could not load TikTok posting capabilities.',
        );
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [credentialId, getTikTokService]);

  useEffect(() => {
    void refreshCapabilities();
    return () => requestRef.current?.abort();
  }, [refreshCapabilities]);

  const selectedPrivacy =
    typeof settings.privacyLevel === 'string' ? settings.privacyLevel : '';
  const isCommercial = settings.commercialContent === true;
  const isBranded = isCommercial && settings.brandedContent === true;
  const options = TIKTOK_PRIVACY_OPTIONS.filter((option) =>
    capabilities?.privacyLevelOptions.includes(option.providerValue),
  );
  const hasVideo = post.ingredients.length === 1;
  const metadata = post.ingredients[0]?.metadata;
  const duration =
    typeof metadata === 'object' ? metadata?.duration : undefined;
  const isDurationKnown =
    typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
  const isDurationValid = Boolean(
    capabilities &&
      isDurationKnown &&
      duration <= capabilities.maxVideoPostDurationSeconds,
  );
  const issues = validateTikTokPublishingSettings(
    settings,
    capabilities?.privacyLevelOptions,
  );
  const effectiveSettings = {
    ...settings,
    allowComments:
      capabilities?.commentDisabled === false &&
      settings.allowComments === true,
    allowDuet:
      capabilities?.duetDisabled === false && settings.allowDuet === true,
    allowStitch:
      capabilities?.stitchDisabled === false && settings.allowStitch === true,
  };
  const isSaved = Object.entries(effectiveSettings).every(
    ([key, value]) => post.targetSettings?.[key] === value,
  );
  const isReady =
    !isLoading &&
    !isSaving &&
    Boolean(capabilities) &&
    hasVideo &&
    isDurationValid &&
    issues.length === 0 &&
    isSaved;
  useEffect(() => {
    onReadinessChange?.(isReady);
    return () => onReadinessChange?.(false);
  }, [isReady, onReadinessChange]);

  function setBoolean(key: string, value: boolean) {
    setSettings((current) => ({
      ...current,
      [key]: value,
      ...(key === 'commercialContent' && !value
        ? { brandedContent: false, yourBrand: false }
        : {}),
      ...(key === 'commercialContent' || key === 'brandedContent'
        ? { musicUsageAccepted: false }
        : {}),
    }));
  }

  async function save() {
    if (!capabilities || issues.length || !hasVideo || !isDurationValid) return;
    setIsSaving(true);
    setError(null);
    try {
      const service = await getReleasesService();
      const groupId =
        post.groupId ?? (await service.ensureFromPost(post.id)).id;
      await service.updateTarget(groupId, post.id, {
        ...(post.targetExecutionState === TargetExecutionState.DRAFT
          ? { executionState: TargetExecutionState.DRAFT }
          : {}),
        settings: effectiveSettings,
        visibility:
          selectedPrivacy === 'private'
            ? PostVisibility.PRIVATE
            : PostVisibility.PUBLIC,
      });
      await onSaved?.();
      NotificationsService.getInstance().success('TikTok settings saved');
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not save TikTok settings.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-label="TikTok publishing settings"
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <h3 className="text-sm font-semibold">Post to TikTok</h3>
      {isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading the account’s current posting options…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
      {!isLoading && !capabilities ? (
        <Button
          label="Refresh TikTok options"
          variant={ButtonVariant.SECONDARY}
          onClick={() => void refreshCapabilities()}
        />
      ) : null}
      {capabilities ? (
        <>
          <p className="text-sm">
            {capabilities.creatorNickname}{' '}
            <span className="text-muted-foreground">
              @{capabilities.creatorUsername}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Maximum video length: {capabilities.maxVideoPostDurationSeconds}{' '}
            seconds.
          </p>
          {!hasVideo ? (
            <p className="text-sm text-warning">
              Add one video using Add media in the editor.
            </p>
          ) : !isDurationValid ? (
            <p role="alert" className="text-sm text-error">
              {isDurationKnown
                ? 'The video exceeds this account’s maximum duration.'
                : 'Video duration is unavailable. Choose a video with duration metadata.'}
            </p>
          ) : null}
          <FormControl label="Privacy">
            <SelectField
              name="tiktokPrivacy"
              value={selectedPrivacy}
              isDisabled={isSaving}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  privacyLevel: event.target.value,
                }))
              }
            >
              <option value="">Choose privacy</option>
              {options.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={isBranded && option.value === 'private'}
                >
                  {option.label}
                </option>
              ))}
            </SelectField>
          </FormControl>
          {(
            [
              ['allowComments', 'Allow comments', capabilities.commentDisabled],
              ['allowDuet', 'Allow duet', capabilities.duetDisabled],
              ['allowStitch', 'Allow stitch', capabilities.stitchDisabled],
            ] as const
          ).map(([key, label, isRestricted]) => (
            <Checkbox
              key={key}
              label={label}
              isChecked={!isRestricted && settings[key] === true}
              isDisabled={isSaving || isRestricted}
              onCheckedChange={(value) => setBoolean(key, value === true)}
            />
          ))}
          <Checkbox
            label="Disclose commercial content"
            isChecked={isCommercial}
            isDisabled={isSaving}
            onCheckedChange={(value) =>
              setBoolean('commercialContent', value === true)
            }
          />
          {isCommercial ? (
            <div className="space-y-2">
              <Checkbox
                label="Your brand"
                isChecked={settings.yourBrand === true}
                isDisabled={isSaving}
                onCheckedChange={(value) =>
                  setBoolean('yourBrand', value === true)
                }
              />
              <Checkbox
                label="Branded content"
                isChecked={settings.brandedContent === true}
                isDisabled={isSaving || selectedPrivacy === 'private'}
                onCheckedChange={(value) =>
                  setBoolean('brandedContent', value === true)
                }
              />
              {selectedPrivacy === 'private' ? (
                <p className="text-xs text-muted-foreground">
                  Branded content cannot be private.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {isBranded
                  ? 'Your video will be labeled Paid partnership.'
                  : settings.yourBrand === true
                    ? 'Your video will be labeled Promotional content.'
                    : 'Choose Your brand, Branded content, or both.'}
              </p>
            </div>
          ) : null}
          <Checkbox
            label={
              <span>
                By posting, you agree to TikTok’s{' '}
                {isBranded ? (
                  <>
                    <Link
                      href="https://www.tiktok.com/legal/page/global/bc-policy/en"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Branded Content Policy
                    </Link>{' '}
                    and{' '}
                  </>
                ) : null}
                <Link
                  href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Music Usage Confirmation
                </Link>
                .
              </span>
            }
            isChecked={settings.musicUsageAccepted === true}
            isDisabled={isSaving}
            onCheckedChange={(value) =>
              setBoolean('musicUsageAccepted', value === true)
            }
          />
          <Button
            label={isSaving ? 'Saving…' : 'Save TikTok settings'}
            variant={ButtonVariant.SECONDARY}
            isDisabled={
              isSaving || issues.length > 0 || !hasVideo || !isDurationValid
            }
            onClick={() => void save()}
          />
          <p className="text-xs text-muted-foreground">
            Preview your video before publishing. TikTok may take a few minutes
            to process it and show it on your profile.
          </p>
        </>
      ) : null}
    </section>
  );
}
