'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type {
  ConnectAccountModalProps,
  ConnectAccountPlatform,
  ConnectAccountPlatformGroup,
} from '@props/pages/brand-integrations.props';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Searchbar from '@ui/primitives/searchbar';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, type ReactNode, useState } from 'react';
import { filterConnectGroups } from './connect-account.util';

interface ConnectAccountShellProps
  extends Pick<
    ConnectAccountModalProps,
    'connectingPlatform' | 'onConnect' | 'onOpenChange' | 'open'
  > {
  /** Rendered above the results, e.g. category tabs. */
  filters?: ReactNode;
  /** Narrows the groups before the search runs, e.g. the active tab. */
  groups: ConnectAccountPlatformGroup[];
  children: (visibleGroups: ConnectAccountPlatformGroup[]) => ReactNode;
}

/**
 * Dialog frame shared by every connect layout: title, search and the
 * scrolling results region. Enter in the search field connects the only
 * remaining platform, so a typed name is a one-step action.
 */
export default function ConnectAccountShell({
  children,
  connectingPlatform,
  filters,
  groups,
  onConnect,
  onOpenChange,
  open,
}: ConnectAccountShellProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const [query, setQuery] = useState('');
  const visibleGroups = filterConnectGroups(groups, query);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || connectingPlatform !== null) {
      return;
    }
    const matches: ConnectAccountPlatform[] = visibleGroups.flatMap(
      (group) => group.platforms,
    );
    const [only] = matches;
    if (matches.length === 1 && only?.isConnectAvailable) {
      onConnect(only);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl" size="lg">
        <DialogHeader>
          <DialogTitle>{translate('connectAccount')}</DialogTitle>
          <DialogDescription className="sr-only">
            {translate('connectAccountModalDescription')}
          </DialogDescription>
        </DialogHeader>

        <Searchbar
          ariaLabel={translate('searchPlatforms')}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
          onKeyDown={handleKeyDown}
          placeholder={translate('searchPlatforms')}
          size={ComponentSize.MD}
          value={query}
        />

        {filters}

        <DialogBody className="max-h-[26rem] min-h-40">
          {visibleGroups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {translate('noPlatformsFound')}
            </p>
          ) : (
            children(visibleGroups)
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
