'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppSwitcherItemConfig } from '@genfeedai/interfaces';
import type { AppSwitcherProps } from '@genfeedai/props/ui/app-switcher.props';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  HiOutlineChartBarSquare,
  HiOutlineCog6Tooth,
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
import { SimpleTooltip } from '../../../primitives/tooltip';

const APPS: AppSwitcherItemConfig[] = [
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

  // Keep operator-task context when switching apps so task-scoped flows do not
  // lose their origin on navigation.
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

  const activeApp = APPS.find((app) => app.id === currentApp);

  function handleAppSelect(app: AppSwitcherItemConfig) {
    router.push(
      withPreservedSearch(app.route(orgSlug, brandSlug), preservedSearch),
    );
    setIsOpen(false);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <SimpleTooltip
        label={activeApp?.label ?? currentApp}
        position="right"
        isDisabled={isOpen}
      >
        <PopoverTrigger asChild>
          <Button
            ariaLabel={`Current app: ${activeApp?.label ?? currentApp}. Click to switch apps.`}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {activeApp && <activeApp.icon className="h-4 w-4" />}
          </Button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent
        align="start"
        className="w-48 p-1"
        side="right"
        sideOffset={8}
      >
        <nav className="flex flex-col gap-0.5">
          {APPS.map((app) => {
            const isActive = app.id === currentApp;
            const Icon = app.icon;
            return (
              <Button
                key={app.id}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                size={ButtonSize.SM}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80',
                )}
                onClick={() => handleAppSelect(app)}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isActive ? 'text-white' : 'text-white/40',
                  )}
                />
                <span>{app.label}</span>
              </Button>
            );
          })}
        </nav>
      </PopoverContent>
    </Popover>
  );
}

export default AppSwitcher;
