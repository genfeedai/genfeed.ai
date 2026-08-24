'use client';

import {
  buildSettingsSearchCatalog,
  filterSettingsSearchCatalog,
  resolveSettingsSearchHref,
} from '@app-config/settings-search-catalog';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  SettingsSearchItem,
  SettingsSearchProps,
} from '@genfeedai/props/ui/settings-search/settings-search.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@ui/primitives/command';
import { overlayMenuSurfaceClassName } from '@ui/primitives/field-control';
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
  const containerRef = useRef<HTMLDivElement | null>(null);
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
    const input = containerRef.current?.querySelector('input');
    input?.focus();
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
      <Command className={cn('bg-transparent', className)} shouldFilter={false}>
        <PopoverAnchor asChild>
          <div
            ref={containerRef}
            className="relative"
            data-testid="settings-search"
          >
            <CommandInput
              value={query}
              onValueChange={(value) => {
                setQuery(value);
                setIsOpen(true);
              }}
              onFocus={handleOpen}
              placeholder={translate('placeholder')}
              aria-label={translate('label')}
              className={cn(
                'h-8 border border-border bg-background px-2.5 pr-12 text-sm text-foreground',
                'placeholder:text-muted-foreground',
                '[&_input]:h-8 [&_input]:px-1 [&_input]:pr-10 [&_input]:!text-foreground',
                '[&_input]:placeholder:!text-muted-foreground',
              )}
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
          side="right"
          sideOffset={8}
          collisionPadding={16}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={cn(
            overlayMenuSurfaceClassName,
            'w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg p-0',
          )}
        >
          <CommandList className="max-h-80 overflow-y-auto p-1">
            {groupedItems.map((group) => (
              <CommandGroup
                key={group.group || group.items[0]?.id}
                heading={group.group || undefined}
              >
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.scope} ${item.label} ${item.id}`}
                    onSelect={() => handleSelect(item)}
                    className="flex cursor-pointer flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                    {item.description ? (
                      <span className="text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandEmpty>{translate('empty')}</CommandEmpty>
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  );
}
