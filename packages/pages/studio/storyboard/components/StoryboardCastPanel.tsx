'use client';

import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { StoryboardCastPanelProps } from '@genfeedai/props/studio/storyboard.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import StoryboardSelect from '@pages/studio/storyboard/components/StoryboardSelect';
import { storyboardAssetLabel } from '@pages/studio/storyboard/utils/storyboard-plan';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** Speakers, their voices and avatars. Edits go through the plan autosave. */
export default function StoryboardCastPanel({
  brandId,
  isDisabled,
  onChange,
  onRetryVoices,
  plan,
  voiceError,
  voiceStatus,
  voices,
}: StoryboardCastPanelProps) {
  const translate = useTranslations('pages.studioStoryboard.plan');
  const { openGallery } = useGalleryModal();
  const { href } = useOrgUrl();
  return (
    <div className="flex flex-col gap-4" data-testid="storyboard-cast">
      {voiceStatus === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          {translate('loadingVoices')}
        </p>
      ) : voiceStatus === 'failed' ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm">
          <p className="text-destructive">{voiceError}</p>
          <Button
            label={translate('retryVoices')}
            variant={ButtonVariant.SECONDARY}
            onClick={onRetryVoices}
          />
        </div>
      ) : !voices.length ? (
        <p className="text-sm text-muted-foreground">{translate('noVoices')}</p>
      ) : null}
      {plan.cast.map((member, index) => (
        <div
          key={member.id}
          className="flex flex-col gap-3 rounded-lg border border-border p-3"
        >
          <Field label={translate('speaker', { ordinal: index + 1 })}>
            <Input
              value={member.name}
              maxLength={40}
              disabled={isDisabled}
              onChange={(event) =>
                onChange({
                  ...plan,
                  cast: plan.cast.map((item) =>
                    item.id === member.id
                      ? { ...item, name: event.target.value }
                      : item,
                  ),
                })
              }
            />
          </Field>
          <Field label={translate('voice')}>
            <StoryboardSelect
              ariaLabel={translate('voiceFor', { name: member.name })}
              value={member.voiceId}
              placeholder={translate('chooseVoice')}
              isDisabled={isDisabled || voiceStatus === 'loading'}
              options={[
                ...(member.voiceId &&
                !voices.some((voice) => voice.id === member.voiceId)
                  ? [
                      {
                        value: member.voiceId,
                        label: translate('voiceUnavailable'),
                        isDisabled: true,
                      },
                    ]
                  : []),
                ...voices.map((voice) => ({
                  value: voice.id,
                  label: storyboardAssetLabel(voice, translate('savedVoice')),
                })),
              ]}
              onChange={(voiceId) =>
                onChange({
                  ...plan,
                  cast: plan.cast.map((item) =>
                    item.id === member.id ? { ...item, voiceId } : item,
                  ),
                })
              }
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              label={
                member.avatarAssetId
                  ? translate('changeAvatar')
                  : translate('chooseAvatar')
              }
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              disabled={isDisabled}
              onClick={() =>
                openGallery({
                  category: IngredientCategory.IMAGE,
                  maxSelectableItems: 1,
                  title: translate('avatarFor', { name: member.name }),
                  onSelect: (items) => {
                    const item = items.find(
                      (candidate) =>
                        candidate.brandId === brandId && !candidate.isDeleted,
                    );
                    if (item)
                      onChange({
                        ...plan,
                        cast: plan.cast.map((candidate) =>
                          candidate.id === member.id
                            ? { ...candidate, avatarAssetId: item.id }
                            : candidate,
                        ),
                      });
                  },
                })
              }
            />
            {member.avatarAssetId ? (
              <Button
                label={translate('clearAvatar')}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                disabled={isDisabled}
                onClick={() =>
                  onChange({
                    ...plan,
                    cast: plan.cast.map((candidate) =>
                      candidate.id === member.id
                        ? { ...candidate, avatarAssetId: undefined }
                        : candidate,
                    ),
                    shots: plan.shots.map((shot) =>
                      shot.speakerId === member.id
                        ? { ...shot, onScreenSpeaker: false }
                        : shot,
                    ),
                  })
                }
              />
            ) : null}
            <Button
              ariaLabel={translate('removeSpeaker', { name: member.name })}
              className="ml-auto"
              icon={<Trash2 className="size-4" />}
              size={ButtonSize.ICON}
              tooltip={translate('removeSpeaker', { name: member.name })}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
              disabled={isDisabled}
              onClick={() =>
                onChange({
                  ...plan,
                  cast: plan.cast.filter((item) => item.id !== member.id),
                  shots: plan.shots.map((shot) =>
                    shot.speakerId === member.id
                      ? {
                          ...shot,
                          speakerId: undefined,
                          onScreenSpeaker: false,
                        }
                      : shot,
                  ),
                })
              }
            />
          </div>
        </div>
      ))}
      <Button
        label={translate('addSpeaker')}
        icon={<Plus className="size-4" />}
        variant={ButtonVariant.SECONDARY}
        disabled={isDisabled || plan.cast.length >= 6}
        onClick={() => {
          let index = plan.cast.length + 1;
          while (
            plan.cast.some(
              (member) =>
                member.name === translate('speaker', { ordinal: index }),
            )
          )
            index++;
          onChange({
            ...plan,
            cast: [
              ...plan.cast,
              {
                id: crypto.randomUUID(),
                name: translate('speaker', { ordinal: index }),
                referenceAssetIds: [],
              },
            ],
          });
        }}
      />
      <Button asChild variant={ButtonVariant.GHOST}>
        <Link href={href(APP_ROUTES.LIBRARY.VOICES)}>
          {translate('voicesLibrary')}
        </Link>
      </Button>
    </div>
  );
}
