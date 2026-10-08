'use client';

'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StudioIdentityFieldsProps } from '@genfeedai/props/studio/studio-generate.props';
import { heyGenAvatarValue } from '@helpers/voice/heygen-identity.helper';
import {
  OptionSelect,
  SettingRow,
} from '@pages/studio/generate/components/StudioSettingControls';
import { useStudioGenerateIdentities } from '@pages/studio/generate/hooks/useStudioGenerateIdentities';
import type { StudioGenerateType } from '@pages/studio/generate/types';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { UserRound } from 'lucide-react';
import type { ReactElement } from 'react';

function describeIdentitySettings(
  type: StudioGenerateType,
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
  const { avatarOptions, isLoadingIdentities, voiceOptions } =
    useStudioGenerateIdentities();

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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          ariaLabel="Identity"
          className={cn(
            'gap-1.5 border border-border bg-background px-2.5 text-xs font-medium hover:bg-accent/50',
            SHELL_CONTROL_HEIGHT_CLASS,
          )}
          icon={<UserRound className="size-3.5" />}
          isDisabled={isDisabled}
          label={summary}
          size={ButtonSize.SM}
          textTransform="none"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      </PopoverTrigger>
      <PopoverPanelContent align="start" className="w-72 p-3" side="top">
        <div className="flex flex-col gap-3">
          {type === 'avatar' ? (
            <SettingRow label="Avatar">
              <OptionSelect
                ariaLabel="Avatar"
                isDisabled={isLoadingIdentities}
                onChange={(value) => {
                  const option = avatarOptions.find(
                    (candidate) => candidate.value === value,
                  );
                  onChange({
                    avatarRef: option?.avatarRef,
                    avatarPhotoUrl: option?.avatarRef ? undefined : value,
                  });
                }}
                options={avatarOptions}
                placeholder="Use saved avatar default"
                value={avatarValue}
              />
            </SettingRow>
          ) : null}
          <SettingRow label="Voice">
            <OptionSelect
              ariaLabel="Voice"
              isDisabled={isLoadingIdentities}
              onChange={(value) => {
                const option = voiceOptions.find(
                  (candidate) => candidate.value === value,
                );
                onChange({
                  voiceRef: option?.voiceRef,
                  voiceId:
                    option?.voiceRef?.externalVoiceId ??
                    option?.voiceRef?.internalVoiceId,
                });
              }}
              options={voiceOptions}
              placeholder={
                type === 'avatar' ? 'Use saved voice default' : 'Choose voice'
              }
              value={selectedVoiceOption?.value}
            />
          </SettingRow>
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}
