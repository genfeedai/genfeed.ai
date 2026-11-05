'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ModalPostSelectedChannelsProps } from '@genfeedai/props/modals/modal.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

/**
 * The content step's reminder of where the post goes: one chip per chosen
 * account, and Edit to go back and change them.
 */
export default function ModalPostSelectedChannels({
  credentials,
  selectedCredentialIds,
  isDisabled,
  onEdit,
}: ModalPostSelectedChannelsProps) {
  const translate = useTranslations('ui.postComposer');
  const selected = credentials.filter((credential) =>
    selectedCredentialIds.includes(credential.id),
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.length === 0 ? (
        <span className="text-sm text-foreground/60">
          {translate('draftOnly')}
        </span>
      ) : (
        <ul aria-label={translate('destinations')} className="contents">
          {selected.map((credential) => {
            const label =
              credential.label ||
              credential.externalHandle ||
              credential.externalName ||
              credential.platform;

            return (
              <li
                className="inline-flex items-center gap-2 rounded-full border border-border py-0.5 pl-0.5 pr-2.5 text-sm"
                key={credential.id}
              >
                <Avatar
                  badge={
                    <PlatformBadge
                      platform={credential.platform}
                      showLabel={false}
                      variant="solid"
                    />
                  }
                  name={label}
                  size="xs"
                  src={credential.externalAvatar}
                />
                <span className="max-w-40 truncate">{label}</span>
              </li>
            );
          })}
        </ul>
      )}
      <Button
        isDisabled={isDisabled}
        label={translate('editChannels')}
        onClick={onEdit}
        size={ButtonSize.SM}
        type="button"
        variant={ButtonVariant.GHOST}
      />
    </div>
  );
}
