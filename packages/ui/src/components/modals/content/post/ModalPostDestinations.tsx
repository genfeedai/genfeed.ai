'use client';

import { ButtonVariant, formatPlatformLabel } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import type {
  ComposerDestination,
  ModalPostDestinationsProps,
} from '@genfeedai/props/modals/modal.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Separator } from '@ui/primitives/separator';
import { Newspaper, Rss } from 'lucide-react';
import { useTranslations } from 'next-intl';

const DESTINATION_ICONS = {
  article: Rss,
  newsletter: Newspaper,
} as const;

const DESTINATIONS: ComposerDestination[] = ['article', 'newsletter'];

// Equal-height cards so every row of the grid lines up.
const CARD_CLASS =
  'flex h-15 min-w-0 items-center gap-3 rounded-xl border px-3 text-left text-sm normal-case transition-colors';
const SELECTED = 'border-foreground bg-foreground/5';
const IDLE = 'border-border hover:bg-muted/50';

function getCredentialLabel(credential: {
  externalHandle?: string | null;
  externalName?: string | null;
  label?: string | null;
  platform: string;
}): string {
  return (
    credential.label ||
    credential.externalHandle ||
    credential.externalName ||
    credential.platform
  );
}

/**
 * Destination picker for the unified composer: connected accounts as avatars
 * with a platform badge in an equal-width grid (multi-select), then Article and
 * Newsletter in their own row; those are exclusive with accounts because they
 * hand off to their own editors.
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
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {credentials.map((credential) => {
              const label = getCredentialLabel(credential);
              const isSelected = selectedCredentialIds.includes(credential.id);

              return (
                <Button
                  key={credential.id}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  ariaLabel={label}
                  aria-pressed={isSelected}
                  isDisabled={isDisabled}
                  onClick={() => onToggleCredential(credential.id)}
                  className={cn(CARD_CLASS, isSelected ? SELECTED : IDLE)}
                >
                  <span className="relative shrink-0">
                    <Avatar className="size-10 bg-background-secondary">
                      {credential.externalAvatar ? (
                        <AvatarImage
                          src={credential.externalAvatar}
                          alt=""
                          className="object-cover"
                        />
                      ) : null}
                      <AvatarFallback className="text-xs font-semibold text-foreground/70">
                        {label.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 flex rounded-full bg-background p-0.5">
                      <PlatformBadge
                        platform={credential.platform}
                        showLabel={false}
                        variant="solid"
                        className="size-4.5 justify-center rounded-full p-0 [&_svg]:size-3"
                      />
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate font-medium">{label}</span>
                    <span className="truncate text-xs text-foreground/60">
                      {formatPlatformLabel(credential.platform)}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
        ) : null}

        <Separator />

        <div className="space-y-2.5">
          <p className="text-2xs font-medium uppercase tracking-wider text-foreground/60">
            {translate('editorsHeading')}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {DESTINATIONS.map((value) => {
              const Icon = DESTINATION_ICONS[value];
              const isSelected = destination === value;

              return (
                <Button
                  key={value}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  ariaLabel={translate(value)}
                  aria-pressed={isSelected}
                  isDisabled={isDisabled}
                  onClick={() => onSelectDestination(value)}
                  className={cn(CARD_CLASS, isSelected ? SELECTED : IDLE)}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background-secondary">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate font-medium">
                      {translate(value)}
                    </span>
                    <span className="truncate text-xs text-foreground/60">
                      {translate(`${value}Hint`)}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
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
