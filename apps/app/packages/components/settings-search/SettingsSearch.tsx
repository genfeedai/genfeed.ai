'use client';

import {
  buildSettingsSearchCatalog,
  filterSettingsSearchCatalog,
  resolveSettingsSearchHref,
} from '@app-config/settings-search-catalog';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  SettingsSearchItem,
  SettingsSearchProps,
} from '@genfeedai/props/ui/settings-search/settings-search.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import { overlayMenuSurfaceClassName } from '@ui/primitives/field-control';
import { Input } from '@ui/primitives/input';
import { Kbd } from '@ui/primitives/kbd';
import { Popover, PopoverAnchor, PopoverContent } from '@ui/primitives/popover';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function groupSettingsSearchItems(
  items: readonly SettingsSearchItem[],
): Array<{ group: string; items: SettingsSearchItem[] }> {
  const groups: Array<{ group: string; items: SettingsSearchItem[] }> = [];

  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.group === item.group) {
      last.items.push(item);
      continue;
    }

    groups.push({ group: item.group, items: [item] });
  }

  return groups;
}

function scrollToSettingsHash(href: string): void {
  const hashIndex = href.indexOf('#');
  if (hashIndex < 0) {
    return;
  }

  const hash = href.slice(hashIndex + 1);
  if (!hash) {
    return;
  }

  document.getElementById(hash)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

export default function SettingsSearch({
  className,
  scope,
}: SettingsSearchProps) {
  const router = useRouter();
  const translate = useTranslations('common.settings.search');
  const { brandSlug, orgSlug } = useOrgUrl();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const catalog = useMemo(
    () =>
      buildSettingsSearchCatalog({
        isEnterprise: hasOrganizationBillingHint(),
        scope,
      }),
    [scope],
  );

  const visibleItems = useMemo(() => {
    const hrefContext = { brandSlug, orgSlug };

    return filterSettingsSearchCatalog(catalog, query).flatMap((item) => {
      const href = resolveSettingsSearchHref(item, hrefContext);
      if (!href) {
        return [];
      }

      return [{ ...item, href }];
    });
  }, [brandSlug, catalog, orgSlug, query]);

  const groupedItems = useMemo(
    () => groupSettingsSearchItems(visibleItems),
    [visibleItems],
  );

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    inputRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (item: SettingsSearchItem) => {
      setIsOpen(false);
      setQuery('');
      router.push(item.href);
      scrollToSettingsHash(item.href);
    },
    [router],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'k'
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleOpen();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleOpen]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn('w-full', className)}>
        <PopoverAnchor asChild>
          <div className="relative" data-testid="settings-search">
            <Input
              aria-label={translate('label')}
              inputRef={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsOpen(true);
              }}
              onFocus={handleOpen}
              placeholder={translate('placeholder')}
              className="pr-12"
            />
            <Kbd
              variant="ghost"
              className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md border border-foreground/[0.08] bg-foreground/[0.03] text-2xs text-foreground/50"
            >
              {translate('hint')}
            </Kbd>
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          collisionPadding={16}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={cn(
            overlayMenuSurfaceClassName,
            'w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg p-0',
          )}
        >
          <div className="max-h-80 overflow-y-auto p-1">
            {groupedItems.map((group) => (
              <section key={group.group || group.items[0]?.id}>
                {group.group ? (
                  <h2 className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    {group.group}
                  </h2>
                ) : null}
                {group.items.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    textTransform="none"
                    onClick={() => handleSelect(item)}
                    className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-foreground/5"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                    {item.description ? (
                      <span className="text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </Button>
                ))}
              </section>
            ))}
            {groupedItems.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {translate('empty')}
              </p>
            ) : null}
          </div>
        </PopoverContent>
      </div>
    </Popover>
  );
}
