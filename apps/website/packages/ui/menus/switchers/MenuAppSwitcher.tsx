'use client';

import { useUser } from '@clerk/nextjs';
import type { UserResource } from '@clerk/types';
import type { AppLink } from '@genfeedai/interfaces/ui/navigation.interface';
import { ButtonVariant } from '@genfeedai/enums';
import { getClerkPublicData } from '@helpers/auth/clerk.helper';
import { getPublisherPostsHref } from '@helpers/content/posts.helper';
import { BG_BLUR, BORDER_WHITE_30, cn } from '@helpers/formatting/cn/cn.util';
import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import Portal from '@ui/layout/portal/Portal';
import Image from 'next/image';
import Link from 'next/link';
import type React from 'react';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

import {
  HiOutlineChartBar,
  HiOutlineCog6Tooth,
  HiOutlineFolderOpen,
  HiOutlinePaintBrush,
  HiOutlinePaperAirplane,
  HiOutlineSquares2X2,
} from 'react-icons/hi2';

export default function MenuAppSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  const logoUrl = useThemeLogo();
  const { user, isLoaded } = useUser();

  // Derive loading state directly (no separate state needed)
  const isLoading = !isLoaded;

  // Get user permissions
  const isRootAdmin = useMemo(() => {
    if (!user) {
      return false;
    }

    const publicData = getClerkPublicData(user as UserResource);
    return publicData.isSuperAdmin === true;
  }, [user]);

  const allApps: AppLink[] = [
    // Main Apps (consolidated)
    {
      category: 'main',
      description: 'Content overview & dashboard',
      href: `${EnvironmentService.apps.app}/overview`,
      icon: <HiOutlineSquares2X2 className="w-4 h-4" />,
      label: 'Overview',
      shortcut: ['⌘', '1'],
    },
    {
      category: 'main',
      description: 'Create AI content',
      href: EnvironmentService.apps.app,
      icon: <HiOutlinePaintBrush className="w-4 h-4" />,
      label: 'Studio',
      shortcut: ['⌘', '2'],
    },
    {
      category: 'main',
      description: 'Manage your content library',
      href: `${EnvironmentService.apps.app}/library/ingredients`,
      icon: <HiOutlineFolderOpen className="w-4 h-4" />,
      label: 'Library',
      shortcut: ['⌘', '3'],
    },
    {
      category: 'main',
      description: 'Publish content to social platforms',
      href: `${EnvironmentService.apps.app}${getPublisherPostsHref()}`,
      icon: <HiOutlinePaperAirplane className="w-4 h-4" />,
      label: 'Posts',
      shortcut: ['⌘', '4'],
    },
    {
      category: 'main',
      description: 'View performance metrics',
      href: `${EnvironmentService.apps.app}/analytics/overview`,
      icon: <HiOutlineChartBar className="w-4 h-4" />,
      label: 'Analytics',
      shortcut: ['⌘', '5'],
    },
    {
      category: 'main',
      description: 'Manage preferences & integrations',
      href: `${EnvironmentService.apps.app}/settings/personal`,
      icon: <HiOutlineCog6Tooth className="w-4 h-4" />,
      label: 'Settings',
      shortcut: ['⌘', 'S'],
    },
    // Admin Apps
    {
      category: 'admin',
      description: 'Govern accounts',
      href: EnvironmentService.apps.admin,
      icon: <HiOutlineCog6Tooth className="w-4 h-4" />,
      label: 'Admin',
    },
  ];

  // Filter apps based on user permissions
  const apps = useMemo(() => {
    if (isRootAdmin) {
      // Root admin has access to all apps
      return allApps;
    }

    // Regular users: exclude Admin only
    return allApps.filter((app) => app.label !== 'Admin');
  }, [isRootAdmin, allApps]);

  // Use state to avoid hydration mismatch (server and client must match initially)
  const [currentApp, setCurrentApp] = useState('');

  // Update currentApp after mount to avoid hydration mismatch
  useEffect(() => {
    // Defer state update to avoid synchronous setState in effect
    const updateCurrentApp = () => {
      const origin = window.location.origin;
      const app = apps.find((a) => origin.includes(a.href));
      const newApp = app?.label || '';

      setCurrentApp((prevApp) => {
        // Only update if changed (avoids cascading renders)
        return newApp !== prevApp ? newApp : prevApp;
      });
    };

    // Use microtask to defer state update
    queueMicrotask(updateCurrentApp);
  }, [apps]);

  // Calculate dropdown position relative to button (bottom-left) - runs synchronously after render
  useIsomorphicLayoutEffect(() => {
    if (isOpen && buttonRef.current && dropdownRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      dropdownRef.current.style.top = `${rect.bottom + 8}px`;
      dropdownRef.current.style.left = `${rect.left}px`;
    }
  }, [isOpen]);

  // Handle clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const dropdown = document.querySelector('.app-switcher-dropdown');

      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdown &&
        !dropdown.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const mainApps = apps.filter((app) => app.category === 'main');
  const creativeApps = apps.filter((app) => app.category === 'creative');
  const adminApps = apps.filter((app) => app.category === 'admin');

  function renderShortcuts(app: AppLink): React.ReactElement | null {
    if (!app.shortcut || currentApp === app.label) {
      return null;
    }

    return (
      <div className="flex gap-2">
        {app.shortcut.map((key) => (
          <kbd
            key={key}
            className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-mono bg-white/10 text-white/70 border border-white/20"
          >
            {key}
          </kbd>
        ))}
      </div>
    );
  }

  function renderCurrentBadge(): React.ReactElement {
    return (
      <Badge className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-white/20 border border-white/[0.08] text-white/90">
        Current
      </Badge>
    );
  }

  function renderAppLink(
    app: AppLink,
    variant: 'grid' | 'list' = 'grid',
  ): React.ReactElement {
    const isActive = currentApp === app.label;
    const baseClasses = cn(
      'flex items-center transition-all text-white',
      'hover:bg-white/15 transition-colors duration-200',
      isActive && 'bg-white/15',
    );

    const gridClasses = cn(baseClasses, 'gap-2.5 px-2.5 py-2');
    const listClasses = cn(baseClasses, 'gap-3 px-3 py-2.5 w-full');

    return (
      <Link
        key={app.href}
        href={app.href}
        className={variant === 'grid' ? gridClasses : listClasses}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(false);
        }}
      >
        <div className="flex-shrink-0">{app.icon}</div>

        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{app.label}</div>
          <div className="text-xs text-white/60 truncate">
            {app.description}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {renderShortcuts(app)}
          {isActive && renderCurrentBadge()}
        </div>
      </Link>
    );
  }

  function renderDropdownContent(): React.ReactElement {
    const regularApps = [...mainApps, ...creativeApps];

    return (
      <div className="w-full">
        {regularApps.length > 0 && (
          <div className="grid grid-cols-2 gap-2 px-2 mb-2">
            {regularApps.map((app) => renderAppLink(app, 'grid'))}
          </div>
        )}

        {adminApps.length > 0 && (
          <>
            {regularApps.length > 0 && (
              <div className="my-2 border-t border-white/[0.08]" />
            )}
            <div className="px-2">
              {adminApps.map((app) => renderAppLink(app, 'list'))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center" ref={buttonRef}>
      <Button
        withWrapper={false}
        variant={ButtonVariant.UNSTYLED}
        ariaLabel={currentApp || 'Apps'}
        title={currentApp || 'Apps'}
        isDisabled={isLoading}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isLoading) {
            setIsOpen(!isOpen);
          }
        }}
        className={cn(
          'flex items-center justify-center p-2 transition-all relative',
          !isLoading && 'hover:bg-white/10 cursor-pointer',
          isLoading && 'cursor-wait',
          isOpen && 'bg-white/10',
        )}
      >
        {logoUrl && logoUrl !== '' && (
          <Image
            src={logoUrl}
            alt={EnvironmentService.LOGO_ALT}
            className={cn(
              'h-6 w-6 object-contain dark:invert',
              isLoading && 'opacity-50',
            )}
            width={24}
            height={24}
            sizes="24px"
            priority
            style={{ height: 'auto', width: 'auto' }}
          />
        )}

        {isLoading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full opacity-50" />
          </span>
        )}
      </Button>

      {isOpen && (
        <Portal>
          <ul
            ref={dropdownRef}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              BG_BLUR,
              BORDER_WHITE_30,
              'app-switcher-dropdown z-[9999] w-[480px] fixed p-2 list-none',
            )}
          >
            {renderDropdownContent()}
          </ul>
        </Portal>
      )}
    </div>
  );
}
