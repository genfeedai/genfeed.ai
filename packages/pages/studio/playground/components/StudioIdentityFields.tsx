'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant, VoiceProvider } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StudioIdentityFieldsProps } from '@genfeedai/props/studio/studio-playground.props';
import { heyGenAvatarValue } from '@helpers/voice/heygen-identity.helper';
import StudioIdentityVoiceRow from '@pages/studio/playground/components/StudioIdentityVoiceRow';
import {
  type StudioIdentityOption,
  useStudioPlaygroundIdentities,
} from '@pages/studio/playground/hooks/useStudioPlaygroundIdentities';
import type { StudioPlaygroundSettings } from '@pages/studio/playground/types';
import {
  hasStudioAvatarSelection,
  hasStudioVoiceSelection,
  isVoiceGenderCompatible,
} from '@pages/studio/playground/utils/studio-identity-selection';
import {
  isStudioVoiceSelectionValid,
  resolveSpeakingVoiceProvider,
} from '@pages/studio/playground/utils/studio-voice-selection';
import { SHELL_CONTROL_HEIGHT_CLASS } from '@ui/constants/shell-chrome.constant';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Check, Mic, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useEffect, useRef, useState } from 'react';

const HEYGEN_VOICE_NOT_CONNECTED_MESSAGE =
  'No HeyGen Voice voices available. Connect your HeyGen account in Settings → Integrations to use your own voice clones.';
const HEYGEN_VOICE_NO_CLONES_MESSAGE =
  'No active HeyGen Voice clones yet. Create one in HeyGen, then reopen this picker.';
const PAGE_SIZE = 12;

type IdentityTab = 'avatar' | 'voice';

function toVoicePatch(
  option: StudioIdentityOption,
): Partial<StudioPlaygroundSettings> {
  return {
    voiceRef: option.voiceRef,
    voiceId:
      option.voiceRef?.externalVoiceId ?? option.voiceRef?.internalVoiceId,
  };
}

/**
 * Identity picker for avatar/voice generation. Avatar videos need both an
 * avatar and a voice, chosen on separate tabs; a side rail shows the pair.
 * Voices whose stated gender differs from the avatar's are hidden.
 */
export default function StudioIdentityFields({
  isDisabled = false,
  onChange,
  settings,
  type,
}: StudioIdentityFieldsProps): ReactElement {
  const translate = useTranslations('agent.generationSetup');
  const translateAction = useTranslations('common.actions');
  const { selectedBrand } = useBrand();
  const isAvatarType = type === 'avatar';
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<IdentityTab>(
    isAvatarType ? 'avatar' : 'voice',
  );
  const [query, setQuery] = useState('');
  const [avatarLimit, setAvatarLimit] = useState(PAGE_SIZE);
  const [voiceLimit, setVoiceLimit] = useState(PAGE_SIZE);
  const prefilledBrandId = useRef<string | null>(null);
  const {
    avatarOptions,
    error,
    isLoadingIdentities,
    retry,
    voiceOptions,
    hasHeyGenPersonalConnection,
    hasHeyGenSpeechVoices,
    hasMoreAvatars,
    isHeyGenSpeechLoaded,
    loadMoreAvatars,
    isLoadingMoreAvatars,
  } = useStudioPlaygroundIdentities({ modelKey: settings.modelKey, type });

  const avatarValue = settings.avatarRef
    ? heyGenAvatarValue(settings.avatarRef)
    : settings.avatarPhotoUrl;
  const selectedAvatarOption = avatarOptions.find(
    (option) => option.value === avatarValue,
  );
  const selectedVoiceOption = voiceOptions.find(
    (option) =>
      (option.voiceRef?.externalVoiceId ?? option.voiceRef?.internalVoiceId) ===
        settings.voiceId &&
      option.voiceRef?.provider === settings.voiceRef?.provider &&
      (!settings.voiceRef?.ownership ||
        option.voiceRef?.ownership === settings.voiceRef.ownership),
  );
  const hasAvatar = hasStudioAvatarSelection(settings);
  const hasVoice = hasStudioVoiceSelection(settings);
  const avatarName =
    selectedAvatarOption?.name ?? settings.avatarRef?.label ?? undefined;
  const voiceName =
    selectedVoiceOption?.name ?? settings.voiceRef?.label ?? undefined;
  const avatarGender = isAvatarType ? selectedAvatarOption?.gender : null;

  const isHeyGenVoiceChosen =
    type === 'voice' &&
    resolveSpeakingVoiceProvider(settings.modelKey) === VoiceProvider.HEYGEN;
  const voiceUnavailableMessage =
    isHeyGenVoiceChosen && isHeyGenSpeechLoaded && !hasHeyGenSpeechVoices
      ? hasHeyGenPersonalConnection
        ? HEYGEN_VOICE_NO_CLONES_MESSAGE
        : HEYGEN_VOICE_NOT_CONNECTED_MESSAGE
      : null;
  // A saved Voice pick the chosen model (or HeyGen's current catalogue) can no
  // longer speak is cleared so the user re-picks instead of sending a mismatch.
  // An avatar voice id without its provider ref is cleared the same way.
  const isSavedVoiceStale =
    Boolean(settings.voiceId) &&
    (isAvatarType
      ? !settings.voiceRef
      : type === 'voice' &&
        (!isStudioVoiceSelectionValid(settings) ||
          (settings.voiceRef?.provider === VoiceProvider.HEYGEN &&
            isHeyGenSpeechLoaded &&
            !selectedVoiceOption)));
  useEffect(() => {
    if (isSavedVoiceStale) {
      onChange({ voiceRef: undefined, voiceId: undefined });
    }
  }, [isSavedVoiceStale, onChange]);

  // The brand's saved avatar and voice start as the visible pick, so there is
  // no hidden server-side fallback behind an empty selection.
  const brandDefaults = selectedBrand?.agentConfig;
  useEffect(() => {
    if (
      !isAvatarType ||
      !selectedBrand ||
      prefilledBrandId.current === selectedBrand.id
    ) {
      return;
    }
    prefilledBrandId.current = selectedBrand.id;
    const patch: Partial<StudioPlaygroundSettings> = {};
    if (!hasAvatar && brandDefaults?.defaultAvatarRef) {
      patch.avatarRef = brandDefaults.defaultAvatarRef;
    } else if (!hasAvatar && brandDefaults?.defaultAvatarPhotoUrl) {
      patch.avatarPhotoUrl = brandDefaults.defaultAvatarPhotoUrl;
    }
    const defaultVoiceRef = brandDefaults?.defaultVoiceRef;
    const defaultVoiceId =
      defaultVoiceRef?.externalVoiceId ?? defaultVoiceRef?.internalVoiceId;
    if (!hasVoice && defaultVoiceRef && defaultVoiceId) {
      patch.voiceRef = defaultVoiceRef;
      patch.voiceId = defaultVoiceId;
    }
    if (Object.keys(patch).length > 0) {
      onChange(patch);
    }
  }, [
    brandDefaults,
    hasAvatar,
    hasVoice,
    isAvatarType,
    onChange,
    selectedBrand,
  ]);

  const normalizedQuery = query.trim().toLowerCase();
  const matchingAvatars = avatarOptions.filter((option) =>
    option.label.toLowerCase().includes(normalizedQuery),
  );
  const compatibleVoices = voiceOptions.filter((option) =>
    isVoiceGenderCompatible(avatarGender, option.gender),
  );
  const matchingVoices = compatibleVoices.filter((option) =>
    option.label.toLowerCase().includes(normalizedQuery),
  );
  const isGenderFiltered =
    Boolean(avatarGender) && compatibleVoices.length < voiceOptions.length;

  const changeTab = (tab: IdentityTab) => {
    setActiveTab(tab);
    setQuery('');
    setAvatarLimit(PAGE_SIZE);
    setVoiceLimit(PAGE_SIZE);
  };

  const handleOpenChange = (isNextOpen: boolean) => {
    setIsOpen(isNextOpen);
    if (isNextOpen) {
      changeTab(isAvatarType && (!hasAvatar || hasVoice) ? 'avatar' : 'voice');
    }
  };

  const selectAvatar = (option: StudioIdentityOption) => {
    const isVoiceMismatched =
      Boolean(selectedVoiceOption) &&
      !isVoiceGenderCompatible(option.gender, selectedVoiceOption?.gender);
    onChange({
      avatarRef: option.avatarRef,
      avatarPhotoUrl: option.avatarRef ? undefined : option.value,
      ...(isVoiceMismatched ? { voiceRef: undefined, voiceId: undefined } : {}),
    });
    if (!hasVoice || isVoiceMismatched) {
      changeTab('voice');
    }
  };

  const missingMessage =
    isAvatarType && !hasAvatar && !hasVoice
      ? translate('identityPickBoth')
      : isAvatarType && !hasAvatar
        ? translate('identityPickAvatar')
        : !hasVoice
          ? translate('identityPickVoice')
          : null;
  const isComplete = missingMessage === null;

  const avatarThumbnail = (
    <Avatar className="size-5 shrink-0 rounded-md">
      {selectedAvatarOption?.preview ? (
        <AvatarImage
          src={selectedAvatarOption.preview}
          alt=""
          className="object-cover"
        />
      ) : null}
      <AvatarFallback className="rounded-md">
        <UserRound className="size-3" />
      </AvatarFallback>
    </Avatar>
  );

  const voiceList = (
    <section aria-label={translate('identityVoiceGallery')}>
      {isGenderFiltered && avatarName ? (
        <p className="pb-2 text-xs text-muted-foreground">
          {translate('identityVoiceGenderFilter', { avatar: avatarName })}
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        {matchingVoices.slice(0, voiceLimit).map((option) => (
          <StudioIdentityVoiceRow
            key={option.value}
            gender={option.gender}
            isDisabled={isDisabled || option.disabled}
            isSelected={option.value === selectedVoiceOption?.value}
            name={option.name}
            onSelect={() => onChange(toVoicePatch(option))}
            previewUrl={option.preview}
            source={option.source}
          />
        ))}
      </div>
      {matchingVoices.length > voiceLimit ? (
        <Button
          label={translate('identityMoreVoices')}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          onClick={() => setVoiceLimit((limit) => limit + PAGE_SIZE)}
        />
      ) : null}
      {compatibleVoices.length > 0 && matchingVoices.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate('identityNoMatches')}
        </p>
      ) : null}
      {!compatibleVoices.length ? (
        <p
          className="text-xs text-muted-foreground"
          role={voiceUnavailableMessage ? 'status' : undefined}
        >
          {voiceUnavailableMessage ??
            translate(
              isLoadingIdentities ? 'identityLoading' : 'identityNoVoices',
            )}
        </p>
      ) : null}
    </section>
  );

  const avatarGrid = (
    <section aria-label={translate('identityAvatarGallery')}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {matchingAvatars.slice(0, avatarLimit).map((option) => (
          <Button
            key={option.value}
            aria-pressed={option.value === avatarValue}
            ariaLabel={option.label}
            title={option.label}
            className={cn(
              'relative flex h-auto min-w-0 flex-col gap-1.5 rounded-lg border p-1.5 text-left text-xs',
              option.value === avatarValue
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-border hover:bg-muted/50',
            )}
            isDisabled={isDisabled || option.disabled}
            onClick={() => selectAvatar(option)}
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
            {option.value === avatarValue ? (
              <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" />
              </span>
            ) : null}
            <span className="w-full truncate font-medium">{option.name}</span>
            <span className="w-full truncate text-2xs text-muted-foreground">
              {option.source}
            </span>
          </Button>
        ))}
      </div>
      {matchingAvatars.length > avatarLimit || hasMoreAvatars ? (
        <Button
          label={translate('identityMoreAvatars')}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          isDisabled={isDisabled || isLoadingIdentities || isLoadingMoreAvatars}
          onClick={async () => {
            if (matchingAvatars.length <= avatarLimit && hasMoreAvatars)
              await loadMoreAvatars();
            setAvatarLimit((limit) => limit + PAGE_SIZE);
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
            isLoadingIdentities ? 'identityLoading' : 'identityNoAvatars',
          )}
        </p>
      ) : null}
    </section>
  );

  const errorNotice = error ? (
    <div className="flex items-center gap-3 pb-3">
      <p className="flex-1 text-xs text-muted-foreground" role="alert">
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
  ) : null;

  const searchInput = (
    <Input
      aria-label={translate(
        activeTab === 'avatar'
          ? 'identitySearchAvatars'
          : 'identitySearchVoices',
      )}
      placeholder={translate(
        activeTab === 'avatar'
          ? 'identitySearchAvatars'
          : 'identitySearchVoices',
      )}
      value={query}
      onChange={(event) => {
        setQuery(event.target.value);
        setAvatarLimit(PAGE_SIZE);
        setVoiceLimit(PAGE_SIZE);
      }}
    />
  );

  const tabBadge = (isDone: boolean) =>
    isDone ? (
      <Check aria-hidden className="size-3.5 text-success" />
    ) : (
      <span aria-hidden className="size-1.5 rounded-full bg-warning" />
    );

  const pairingSlot = (
    tab: IdentityTab,
    title: string,
    value: string | undefined,
    preview: ReactElement | null,
  ) => (
    <Button
      aria-current={activeTab === tab}
      ariaLabel={`${title}: ${value ?? translate('identityRequired')}`}
      className={cn(
        'flex h-auto w-full flex-col items-stretch gap-2 rounded-lg border bg-muted/30 p-2.5 text-left',
        activeTab === tab ? 'border-foreground/60' : 'border-border',
      )}
      onClick={() => changeTab(tab)}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <span className="flex items-center justify-between text-2xs text-muted-foreground">
        {title}
        {value ? <Check className="size-3.5 text-success" /> : null}
      </span>
      {preview}
      <span
        className={cn(
          'truncate text-xs',
          value ? 'font-semibold' : 'text-warning',
        )}
      >
        {value ?? translate('identityRequired')}
      </span>
    </Button>
  );

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          ariaLabel="Identity"
          className={cn(
            'min-w-0 max-w-full gap-1.5 px-2.5 text-xs font-medium',
            SHELL_CONTROL_HEIGHT_CLASS,
          )}
          isDisabled={isDisabled}
          size={ButtonSize.SM}
          textTransform="none"
          title={
            missingMessage ??
            [avatarName, voiceName].filter(Boolean).join(' · ')
          }
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          {isAvatarType ? (
            <span className="flex min-w-0 items-center gap-1.5">
              {hasAvatar ? (
                avatarThumbnail
              ) : (
                <UserRound className="size-3.5 shrink-0 text-warning" />
              )}
              <span
                className={cn(
                  'max-w-32 truncate',
                  !hasAvatar && 'text-warning',
                )}
              >
                {avatarName ?? translate('identityTabAvatar')}
              </span>
              <span className="h-4 w-px shrink-0 bg-border" />
            </span>
          ) : null}
          <span className="flex min-w-0 items-center gap-1.5">
            <Mic
              className={cn('size-3.5 shrink-0', !hasVoice && 'text-warning')}
            />
            <span
              className={cn('max-w-32 truncate', !hasVoice && 'text-warning')}
            >
              {voiceName ?? translate('identityTabVoice')}
            </span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverPanelContent
        align="start"
        className={cn(
          'flex max-h-[min(640px,var(--radix-popover-content-available-height,75vh))] flex-col overflow-hidden p-0',
          isAvatarType
            ? 'w-[min(760px,calc(100vw-2rem))]'
            : 'w-[min(560px,calc(100vw-2rem))]',
        )}
        side="top"
      >
        {isAvatarType ? (
          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-48 shrink-0 flex-col gap-2.5 border-r border-border p-3 sm:flex">
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                {translate('identityPairing')}
              </p>
              {pairingSlot(
                'avatar',
                translate('identityTabAvatar'),
                avatarName,
                <Avatar className="aspect-[4/3] h-auto w-full rounded-md">
                  {selectedAvatarOption?.preview ? (
                    <AvatarImage
                      src={selectedAvatarOption.preview}
                      alt=""
                      className="object-cover"
                    />
                  ) : null}
                  <AvatarFallback
                    className={cn(
                      'rounded-md',
                      !hasAvatar &&
                        'border border-dashed border-muted-foreground/40 bg-transparent',
                    )}
                  >
                    <UserRound className="size-6 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>,
              )}
              {pairingSlot(
                'voice',
                translate('identityTabVoice'),
                voiceName,
                null,
              )}
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
              <Tabs
                activeTab={activeTab}
                ariaLabel={translate('identityTabsAria')}
                className="min-h-0 flex-1 pt-3"
                contentClassName="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-3"
                items={[
                  {
                    id: 'avatar',
                    label: translate('identityTabAvatar'),
                    badge: tabBadge(hasAvatar),
                  },
                  {
                    id: 'voice',
                    label: translate('identityTabVoice'),
                    badge: tabBadge(hasVoice),
                  },
                ]}
                listClassName="mx-3"
                onTabChange={(tab) => changeTab(tab as IdentityTab)}
              >
                <div className="sticky top-0 z-10 bg-secondary pb-3">
                  {searchInput}
                </div>
                {errorNotice}
                {activeTab === 'avatar' ? avatarGrid : voiceList}
              </Tabs>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 p-3 pb-2">{searchInput}</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {errorNotice}
              {voiceList}
            </div>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-2.5">
          <p
            className={cn(
              'min-w-0 flex-1 truncate text-xs',
              isComplete ? 'text-muted-foreground' : 'text-warning',
            )}
          >
            {missingMessage ??
              (isAvatarType
                ? translate('identityPairSummary', {
                    avatar: avatarName ?? '',
                    voice: voiceName ?? '',
                  })
                : voiceName)}
          </p>
          <Button
            isDisabled={!isComplete}
            label={translate('identityDone')}
            onClick={() => setIsOpen(false)}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
          />
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}
