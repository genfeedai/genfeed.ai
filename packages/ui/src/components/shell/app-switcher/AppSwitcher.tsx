'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppSwitcherItemConfig } from '@genfeedai/interfaces';
import type { AppSwitcherProps } from '@genfeedai/props/ui/app-switcher.props';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  HiChevronDown,
  HiOutlineChartBarSquare,
  HiOutlineCog6Tooth,
  HiOutlineDocumentText,
  HiOutlineFolder,
  HiOutlinePencilSquare,
  HiOutlineRectangleGroup,
  HiOutlineSparkles,
  HiOutlineSquares2X2,
} from 'react-icons/hi2';
import { Button } from '../../../primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../primitives/popover';

const CONTENT_APPS: AppSwitcherItemConfig[] = [
  {
    icon: HiOutlineFolder,
    id: 'library',
    label: 'Library',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/library/ingredients` : `/${org}/~/overview`,
  },
  {
    icon: HiOutlineDocumentText,
    id: 'posts',
    label: 'Posts',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/posts` : `/${org}/~/overview`,
  },
];

const PLATFORM_APPS: AppSwitcherItemConfig[] = [
  {
    icon: HiOutlineSquares2X2,
    id: 'workspace',
    label: 'Workspace',
    route: (org) => `/${org}/~/overview`,
  },
  {
    icon: HiOutlineSparkles,
    id: 'studio',
    label: 'Studio',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/studio/image` : `/${org}/~/overview`,
  },
  {
    icon: HiOutlineCog6Tooth,
    id: 'workflows',
    label: 'Workflows',
    route: (org) => `/${org}/~/workflows`,
  },
  {
    icon: HiOutlinePencilSquare,
    id: 'editor',
    label: 'Editor',
    route: (org) => `/${org}/~/editor`,
  },
  {
    icon: HiOutlineRectangleGroup,
    id: 'compose',
    label: 'Compose',
    route: (org) => `/${org}/~/compose/post`,
  },
  {
    icon: HiOutlineChartBarSquare,
    id: 'analytics',
    label: 'Analytics',
    route: (org) => `/${org}/~/analytics/overview`,
  },
];

const APP_SECTIONS = [
  { items: CONTENT_APPS, key: 'content' },
  { items: PLATFORM_APPS, key: 'platform' },
] as const;

const ALL_APPS = [...CONTENT_APPS, ...PLATFORM_APPS];

function withPreservedSearch(path: string, preservedSearch?: string): string {
  if (!preservedSearch) {
    return path;
  }

  const normalizedSearch = preservedSearch.startsWith('?')
    ? preservedSearch.slice(1)
    : preservedSearch;

  if (!normalizedSearch) {
    return path;
  }

  const [pathname, existingSearch = ''] = path.split('?', 2);
  const mergedSearchParams = new URLSearchParams(existingSearch);
  const preservedSearchParams = new URLSearchParams(normalizedSearch);

  for (const [key, value] of preservedSearchParams.entries()) {
    mergedSearchParams.set(key, value);
  }

  const nextSearch = mergedSearchParams.toString();

  return nextSearch ? `${pathname}?${nextSearch}` : pathname;
}

export function AppSwitcher({
  brandSlug,
  currentApp,
  orgSlug,
  preservedSearch,
}: AppSwitcherProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const activeApp = ALL_APPS.find((app) => app.id === currentApp);

  function handleAppSelect(app: AppSwitcherItemConfig) {
    router.push(
      withPreservedSearch(app.route(orgSlug, brandSlug), preservedSearch),
    );
    setIsOpen(false);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          ariaLabel={`Current app: ${activeApp?.label ?? currentApp}. Click to switch apps.`}
          size={ButtonSize.SM}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="gen-shell-control inline-flex h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-foreground/90"
          data-active={isOpen ? 'true' : 'false'}
        >
          {activeApp ? (
            <activeApp.icon className="h-4 w-4 text-foreground/55" />
          ) : null}
          <span>{activeApp?.label ?? currentApp}</span>
          <HiChevronDown
            className={cn(
              'h-3.5 w-3.5 text-foreground/42 transition-transform duration-200',
              isOpen && 'rotate-180',
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="gen-shell-panel w-60 rounded-md p-1.5"
        side="bottom"
        sideOffset={10}
      >
        <nav className="flex flex-col gap-1">
          {APP_SECTIONS.map((section, sectionIndex) => (
            <div
              key={section.key}
              className={cn(
                sectionIndex > 0 && 'border-t border-white/[0.08] pt-1.5',
              )}
            >
              {section.items.map((app) => {
                const isActive = app.id === currentApp;
                const Icon = app.icon;

                return (
                  <Button
                    key={app.id}
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    size={ButtonSize.SM}
                    aria-current={isActive ? 'page' : undefined}
                    className="gen-shell-surface flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors"
                    data-active={isActive ? 'true' : 'false'}
                    onClick={() => handleAppSelect(app)}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isActive ? 'text-foreground' : 'text-foreground/42',
                      )}
                    />
                    <span>{app.label}</span>
                  </Button>
                );
              })}
            </div>
          ))}
        </nav>
      </PopoverContent>
    </Popover>
  );
}

export default AppSwitcher;
