'use client';

import { toConnectedAccount } from '@genfeedai/helpers/publisher/connected-account.helper';
import type {
  ComposerDestination,
  ModalPostDestinationsProps,
} from '@genfeedai/props/modals/modal.props';
import AccountPicker from '@ui/display/connected-account/AccountPicker';
import FormControl from '@ui/primitives/field';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { Separator } from '@ui/primitives/separator';
import { Newspaper, Rss } from 'lucide-react';
import { useTranslations } from 'next-intl';

const DESTINATION_ICONS = {
  article: Rss,
  newsletter: Newspaper,
} as const;

const DESTINATIONS: ComposerDestination[] = ['article', 'newsletter'];

/**
 * Destination picker for the unified composer: connected accounts as an avatar
 * row (multi-select), then Article and Newsletter in their own row; those are
 * exclusive with accounts because they hand off to their own editors.
 */
export default function ModalPostDestinations({
  credentials,
  selectedCredentialIds,
  destination,
  isDisabled,
  onToggleCredential,
  onSelectDestination,
}: ModalPostDestinationsProps) {
  const translate = useTranslations('ui.postComposer');

  return (
    <FormControl
      label={translate('destinations')}
      helpText={translate('destinationsDescription')}
    >
      <div className="space-y-4">
        {credentials.length > 0 ? (
          <AccountPicker
            ariaLabel={translate('destinations')}
            isDisabled={isDisabled}
            items={credentials.map((credential) => ({
              ...toConnectedAccount(credential),
              id: credential.id,
            }))}
            onValueChange={(nextIds) => {
              const changed = [
                ...nextIds.filter((id) => !selectedCredentialIds.includes(id)),
                ...selectedCredentialIds.filter((id) => !nextIds.includes(id)),
              ];
              for (const credentialId of changed) {
                onToggleCredential(credentialId);
              }
            }}
            size="lg"
            type="multiple"
            value={selectedCredentialIds}
          />
        ) : null}

        <Separator />

        <div className="space-y-2.5">
          <p className="text-2xs font-medium uppercase tracking-label text-foreground/60">
            {translate('editorsHeading')}
          </p>
          <OptionTileGroup
            ariaLabel={translate('editorsHeading')}
            columns={2}
            isDeselectable
            isDisabled={isDisabled}
            onValueChange={(next) => {
              const target = next ?? destination;
              if (target) {
                onSelectDestination(target);
              }
            }}
            value={destination ?? undefined}
          >
            {DESTINATIONS.map((value) => {
              const Icon = DESTINATION_ICONS[value];

              return (
                <OptionTile
                  ariaLabel={translate(value)}
                  description={translate(`${value}Hint`)}
                  icon={
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                      <Icon className="size-4" />
                    </span>
                  }
                  key={value}
                  title={translate(value)}
                  value={value}
                />
              );
            })}
          </OptionTileGroup>
        </div>

        {credentials.length === 0 && destination === null ? (
          <p className="text-xs text-foreground/60">
            {translate('noAccounts')}
          </p>
        ) : null}
        {credentials.length > 0 &&
        destination === null &&
        selectedCredentialIds.length === 0 ? (
          <p className="text-xs text-foreground/60">{translate('draftOnly')}</p>
        ) : null}
      </div>
    </FormControl>
  );
}
