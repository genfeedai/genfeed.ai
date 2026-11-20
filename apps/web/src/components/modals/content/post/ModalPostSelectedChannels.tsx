'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { toConnectedAccount } from '@genfeedai/helpers/publisher/connected-account.helper';
import type { ModalPostSelectedChannelsProps } from '@genfeedai/props/modals/modal.props';
import ConnectedAccount from '@ui/display/connected-account/ConnectedAccount';
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
          {selected.map((credential) => (
            <li
              className="inline-flex max-w-52 items-center rounded-full border border-border py-0.5 pl-0.5 pr-2.5 text-sm"
              key={credential.id}
            >
              <ConnectedAccount
                account={toConnectedAccount(credential)}
                size="xs"
              />
            </li>
          ))}
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
