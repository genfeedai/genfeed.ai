'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppConfig } from '@genfeedai/interfaces';
import type { AppSwitcherProps } from '@genfeedai/props/ui/app-switcher.props';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../../../primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../primitives/popover';

const APPS: AppConfig[] = [
  {
    id: 'workspace',
    icon: '⌂',
    label: 'Workspace',
    route: (org) => `/${org}/~/overview`,
  },
  {
    id: 'studio',
    icon: '🎨',
    label: 'Studio',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/studio/image` : `/${org}/~/overview`,
  },
  {
    id: 'workflows',
    icon: '⚡',
    label: 'Workflows',
    route: (org) => `/${org}/~/workflows`,
  },
  {
    id: 'editor',
    icon: '✏️',
    label: 'Editor',
    route: (org) => `/${org}/~/editor`,
  },
  {
    id: 'compose',
    icon: '📝',
    label: 'Compose',
    route: (org) => `/${org}/~/compose/post`,
  },
  {
    id: 'analytics',
    icon: '📊',
    label: 'Analytics',
    route: (org) => `/${org}/~/analytics/overview`,
  },
];

export function AppSwitcher({
  brandSlug,
  currentApp,
  orgSlug,
}: AppSwitcherProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const activeApp = APPS.find((app) => app.id === currentApp);

  function handleAppSelect(app: AppConfig) {
    router.push(app.route(orgSlug, brandSlug));
    setIsOpen(false);
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          ariaLabel={`Current app: ${activeApp?.label ?? currentApp}. Click to switch apps.`}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <span aria-hidden="true">{activeApp?.icon}</span>
          <span>{activeApp?.label ?? currentApp}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2" sideOffset={6}>
        <div className="grid grid-cols-3 gap-1">
          {APPS.map((app) => {
            const isActive = app.id === currentApp;
            return (
              <Button
                key={app.id}
                ariaLabel={app.label}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-col gap-1 h-auto py-2',
                  isActive && 'ring-2 ring-[var(--gen-accent-primary)]',
                )}
                onClick={() => handleAppSelect(app)}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {app.icon}
                </span>
                <span className="text-xs leading-none">{app.label}</span>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default AppSwitcher;
