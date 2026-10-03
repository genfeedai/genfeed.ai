'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import type {
  ComposerDestination,
  ModalPostDestinationsProps,
} from '@genfeedai/props/modals/modal.props';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { Button } from '@ui/primitives/button';
import FormControl from '@ui/primitives/field';
import { Newspaper, Rss } from 'lucide-react';
import { useTranslations } from 'next-intl';

const DESTINATION_ICONS = {
  article: Rss,
  newsletter: Newspaper,
} as const;

const DESTINATIONS: ComposerDestination[] = ['article', 'newsletter'];

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
 * with a platform badge (multi-select), plus Article and Newsletter, which are
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
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
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
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm normal-case transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                <span className="relative shrink-0">
                  <Avatar className="size-8 bg-background-secondary">
                    {credential.externalAvatar ? (
                      <AvatarImage
                        src={credential.externalAvatar}
                        alt=""
                        className="object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="text-2xs font-semibold text-foreground/70">
                      {label.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-1 -right-1 flex rounded-full bg-background p-0.5">
                    <PlatformBadge
                      platform={credential.platform}
                      showLabel={false}
                      variant="solid"
                      className="size-4.5 justify-center rounded-full p-0 [&_svg]:size-3"
                    />
                  </span>
                </span>
                <span className="max-w-32 truncate">{label}</span>
              </Button>
            );
          })}

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
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm normal-case transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background-secondary">
                  <Icon className="size-4" />
                </span>
                <span className="flex flex-col leading-tight">
                  <span>{translate(value)}</span>
                  <span className="text-xs text-foreground/60">
                    {translate(`${value}Hint`)}
                  </span>
                </span>
              </Button>
            );
          })}
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
