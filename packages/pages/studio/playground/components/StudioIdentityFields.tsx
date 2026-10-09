'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StudioIdentityFieldsProps } from '@genfeedai/props/studio/studio-playground.props';
import { heyGenAvatarValue } from '@helpers/voice/heygen-identity.helper';
import { useStudioPlaygroundIdentities } from '@pages/studio/playground/hooks/useStudioPlaygroundIdentities';
import type { StudioPlaygroundType } from '@pages/studio/playground/types';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Mic, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useState } from 'react';

function describeIdentitySettings(
  type: StudioPlaygroundType,
  avatarLabel: string | undefined,
  voiceLabel: string | undefined,
): string {
  if (type === 'avatar') {
    return avatarLabel && voiceLabel
      ? `${avatarLabel} · ${voiceLabel}`
      : avatarLabel || voiceLabel || 'Choose avatar';
  }
  return voiceLabel || 'Choose voice';
}

/**
 * Identity chip for avatar/voice generation — the portrait and speaking
 * voice pickers `capabilities.hasIdentity` types need but the shared
 * `GenerationSetupPopover` (image/video Look + Brand only) doesn't model.
 */
export default function StudioIdentityFields({
  isDisabled = false,
  onChange,
  settings,
  type,
}: StudioIdentityFieldsProps): ReactElement {
  const translate = useTranslations('agent.generationSetup');
  const translateAction = useTranslations('common.actions');
  const [query, setQuery] = useState('');
  const [avatarLimit, setAvatarLimit] = useState(12);
  const [voiceLimit, setVoiceLimit] = useState(12);
  const {
    avatarOptions,
    error,
    isLoadingIdentities,
    retry,
    voiceOptions,
    hasMoreAvatars,
    loadMoreAvatars,
    isLoadingMoreAvatars,
  } = useStudioPlaygroundIdentities();

  const avatarValue = settings.avatarRef
    ? heyGenAvatarValue(settings.avatarRef)
    : settings.avatarPhotoUrl;
  const selectedVoiceOption = voiceOptions.find(
    (option) =>
      (option.voiceRef?.externalVoiceId ?? option.voiceRef?.internalVoiceId) ===
        settings.voiceId &&
      option.voiceRef?.provider === settings.voiceRef?.provider &&
      (!settings.voiceRef?.ownership ||
        option.voiceRef?.ownership === settings.voiceRef.ownership),
  );
  const avatarLabel = avatarOptions.find(
    (option) => option.value === avatarValue,
  )?.label;
  const voiceLabel = selectedVoiceOption?.label;
  const summary = describeIdentitySettings(type, avatarLabel, voiceLabel);
  const matchingAvatars = avatarOptions.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const matchingVoices = voiceOptions.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          ariaLabel="Identity"
          className={cn(
            'min-w-0 max-w-full gap-1.5 px-2.5 text-xs font-medium',
            SHELL_CONTROL_HEIGHT_CLASS,
          )}
          icon={
            type === 'voice' ? (
              <Mic className="size-3.5" />
            ) : (
              <UserRound className="size-3.5" />
            )
          }
          isDisabled={isDisabled}
          label={summary}
          size={ButtonSize.SM}
          textTransform="none"
          title={summary}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </PopoverTrigger>
      <PopoverPanelContent
        align="start"
        className="flex max-h-[min(640px,var(--radix-popover-content-available-height,75vh))] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden p-3"
        side="top"
      >
        <Input
          aria-label={translate('identitySearch')}
          placeholder={translate('identitySearch')}
          value={query}
          className="mb-3 shrink-0"
          onChange={(event) => {
            setQuery(event.target.value);
            setAvatarLimit(12);
            setVoiceLimit(12);
          }}
        />
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {error ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground" role="alert">
                {error}
              </p>
              <Button
                ariaLabel={translate('identityRetryAria')}
                label={translateAction('retry')}
                isDisabled={isLoadingIdentities}
                onClick={retry}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          ) : null}
          {type === 'avatar' ? (
            <section
              aria-label={translate('identityAvatarGallery')}
              className="space-y-2"
            >
              <h3 className="text-sm font-medium">
                {translate('identityAvatarGallery')}
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                <Button
                  aria-pressed={!avatarValue}
                  ariaLabel={translate('identityDefaultAvatar')}
                  className={cn(
                    'flex h-auto min-h-24 flex-col gap-2 rounded-md border p-2 text-xs',
                    !avatarValue
                      ? 'border-primary bg-primary/10'
                      : 'border-border',
                  )}
                  isDisabled={isDisabled}
                  onClick={() =>
                    onChange({
                      avatarRef: undefined,
                      avatarPhotoUrl: undefined,
                    })
                  }
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  <UserRound className="size-8" />
                  <span>{translate('identityDefaultAvatar')}</span>
                </Button>
                {matchingAvatars.slice(0, avatarLimit).map((option) => (
                  <Button
                    key={option.value}
                    aria-pressed={option.value === avatarValue}
                    ariaLabel={option.label}
                    title={option.label}
                    className={cn(
                      'flex h-auto min-w-0 flex-col gap-2 rounded-md border p-2 text-xs',
                      option.value === avatarValue
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted/50',
                    )}
                    isDisabled={isDisabled || option.disabled}
                    onClick={() =>
                      onChange({
                        avatarRef: option.avatarRef,
                        avatarPhotoUrl: option.avatarRef
                          ? undefined
                          : option.value,
                      })
                    }
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                  >
                    <Avatar className="aspect-square h-auto w-full rounded-md">
                      {option.preview ? (
                        <AvatarImage
                          src={option.preview}
                          alt=""
                          className="object-cover"
                        />
                      ) : null}
                      <AvatarFallback className="rounded-md">
                        <UserRound className="size-8" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="w-full truncate text-left">
                      {option.label}
                    </span>
                  </Button>
                ))}
              </div>
              {matchingAvatars.length > avatarLimit || hasMoreAvatars ? (
                <Button
                  label={translate('identityMoreAvatars')}
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                  isDisabled={
                    isDisabled || isLoadingIdentities || isLoadingMoreAvatars
                  }
                  onClick={async () => {
                    if (matchingAvatars.length <= avatarLimit && hasMoreAvatars)
                      await loadMoreAvatars();
                    setAvatarLimit((limit) => limit + 12);
                  }}
                />
              ) : null}
              {avatarOptions.length > 0 && matchingAvatars.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {translate('identityNoMatches')}
                </p>
              ) : null}
              {!avatarOptions.length ? (
                <p className="text-xs text-muted-foreground">
                  {translate(
                    isLoadingIdentities
                      ? 'identityLoading'
                      : 'identityNoAvatars',
                  )}
                </p>
              ) : null}
            </section>
          ) : null}
          <section
            aria-label={translate('identityVoiceGallery')}
            className="space-y-2"
          >
            <h3 className="text-sm font-medium">
              {translate('identityVoiceGallery')}
            </h3>
            {type === 'avatar' ? (
              <Button
                aria-pressed={!settings.voiceId && !settings.voiceRef}
                label={translate('identityDefaultVoice')}
                isDisabled={isDisabled}
                onClick={() =>
                  onChange({ voiceRef: undefined, voiceId: undefined })
                }
                size={ButtonSize.SM}
                variant={
                  !settings.voiceId && !settings.voiceRef
                    ? ButtonVariant.SECONDARY
                    : ButtonVariant.GHOST
                }
              />
            ) : null}
            <div className="space-y-2">
              {matchingVoices.slice(0, voiceLimit).map((option) => (
                <div key={option.value} className="space-y-1">
                  <Button
                    ariaLabel={option.label}
                    aria-pressed={option.value === selectedVoiceOption?.value}
                    className="w-full justify-start gap-2 text-left text-xs"
                    icon={<Mic className="size-4 shrink-0" />}
                    isDisabled={isDisabled || option.disabled}
                    label={option.label}
                    onClick={() =>
                      onChange({
                        voiceRef: option.voiceRef,
                        voiceId:
                          option.voiceRef?.externalVoiceId ??
                          option.voiceRef?.internalVoiceId,
                      })
                    }
                    size={ButtonSize.SM}
                    variant={
                      option.value === selectedVoiceOption?.value
                        ? ButtonVariant.SECONDARY
                        : ButtonVariant.GHOST
                    }
                    withWrapper={false}
                  />
                  {option.preview ? (
                    <AudioPreviewPlayer
                      audioUrl={option.preview}
                      label={option.label}
                      className="px-2"
                      isTimelineVisible
                      stopOnUnmount
                    />
                  ) : (
                    <p className="px-2 text-2xs text-muted-foreground">
                      {translate('identityNoSample')}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {matchingVoices.length > voiceLimit ? (
              <Button
                label={translate('identityMoreVoices')}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
                onClick={() => setVoiceLimit((limit) => limit + 12)}
              />
            ) : null}
            {voiceOptions.length > 0 && matchingVoices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {translate('identityNoMatches')}
              </p>
            ) : null}
            {!voiceOptions.length ? (
              <p className="text-xs text-muted-foreground">
                {translate(
                  isLoadingIdentities ? 'identityLoading' : 'identityNoVoices',
                )}
              </p>
            ) : null}
          </section>
          <p className="text-xs text-muted-foreground">
            {translate('identityGenerateHint')}
          </p>
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}
