'use client';

import type { ConnectAccountModalProps } from '@props/pages/brand-integrations.props';
import type { ResolvedOAuthConnectPlatform } from '@ui/constants/oauth-connect-platforms';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useTranslations } from 'next-intl';

/** Unavailable platforms stay visible (disabled) rather than disappearing, so
 * a brand owner sees Threads exists before its readiness check clears. */
function getConnectReasonKey(
  item: ResolvedOAuthConnectPlatform,
): 'notReadyReason' | 'checkingReadyReason' | null {
  if (item.isConnectAvailable) {
    return null;
  }
  return item.readiness === 'unavailable'
    ? 'notReadyReason'
    : 'checkingReadyReason';
}

export default function ConnectAccountModal({
  connectingPlatform,
  onConnect,
  onOpenChange,
  open,
  platformConnectedCounts,
  platformGroups,
}: ConnectAccountModalProps) {
  const translate = useTranslations('pages.brandSocialMedia');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>{translate('connectAccount')}</DialogTitle>
          <DialogDescription>
            {translate('connectAccountDescription')}
          </DialogDescription>
        </DialogHeader>

        <Command className="bg-transparent">
          <CommandInput placeholder={translate('searchPlatforms')} />
          <CommandList className="max-h-[22rem] px-1 pb-2">
            <CommandEmpty>{translate('noPlatformsFound')}</CommandEmpty>
            {platformGroups.map((group) => (
              <CommandGroup key={group.id} heading={group.label}>
                {group.platforms.map((item) => {
                  const connectKey = item.connectId ?? item.platform;
                  const { Icon } = item;
                  const reasonKey = getConnectReasonKey(item);
                  const isConnectingThis = connectingPlatform === item.platform;
                  const connectedCount =
                    platformConnectedCounts[item.platform] ?? 0;

                  return (
                    <CommandItem
                      key={connectKey}
                      value={`${item.label} ${item.platform}`}
                      disabled={
                        !item.isConnectAvailable || connectingPlatform !== null
                      }
                      onSelect={() => onConnect(item)}
                      className="items-center gap-2.5 py-2"
                    >
                      <Icon
                        className={`size-4 shrink-0 ${item.iconClassName}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {isConnectingThis
                            ? translate('connectingEllipsis')
                            : reasonKey
                              ? translate(reasonKey)
                              : translate('connectedCount', {
                                  count: connectedCount,
                                })}
                        </span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
