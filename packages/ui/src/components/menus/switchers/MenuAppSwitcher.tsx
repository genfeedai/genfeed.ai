'use client';

import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import { getPublisherPostsHref } from '@genfeedai/helpers/content/posts.helper';
import { useThemeLogo } from '@genfeedai/hooks/ui/use-theme-logo/use-theme-logo';
import type { AppLink } from '@genfeedai/interfaces/ui/navigation.interface';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  HiOutlineChartBar,
  HiOutlineCog6Tooth,
  HiOutlineFolderOpen,
  HiOutlinePaintBrush,
  HiOutlinePaperAirplane,
  HiOutlineSquares2X2,
} from 'react-icons/hi2';

import { AppSwitcherPanel } from './AppSwitcherPanel';
import { AppSwitcherTrigger } from './AppSwitcherTrigger';

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function MenuAppSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const logoUrl = useThemeLogo();
  const { isLoading, isSuperAdmin } = useAccessState();

  // Derive loading state directly (no separate state needed)
  const isRootAdmin = isSuperAdmin;

  const allApps = useMemo<AppLink[]>(
    () => [
      // Main Apps (consolidated)
      {
        category: 'main',
        description: 'Content overview & dashboard',
        href: `${EnvironmentService.apps.app}/overview`,
        icon: <HiOutlineSquares2X2 className="size-4" />,
        label: 'Overview',
        shortcut: ['⌘', '1'],
      },
      {
        category: 'main',
        description: 'Create AI content',
        href: EnvironmentService.apps.app,
        icon: <HiOutlinePaintBrush className="size-4" />,
        label: 'Studio',
        shortcut: ['⌘', '2'],
      },
      {
        category: 'main',
        description: 'Manage your content library',
        href: `${EnvironmentService.apps.app}/library/ingredients`,
        icon: <HiOutlineFolderOpen className="size-4" />,
        label: 'Library',
        shortcut: ['⌘', '3'],
      },
      {
        category: 'main',
        description: 'Publish content to social platforms',
        href: `${EnvironmentService.apps.app}${getPublisherPostsHref()}`,
        icon: <HiOutlinePaperAirplane className="size-4" />,
        label: 'Posts',
        shortcut: ['⌘', '4'],
      },
      {
        category: 'main',
        description: 'View performance metrics',
        href: `${EnvironmentService.apps.app}/analytics/overview`,
        icon: <HiOutlineChartBar className="size-4" />,
        label: 'Analytics',
        shortcut: ['⌘', '5'],
      },
      {
        category: 'main',
        description: 'Manage preferences & integrations',
        href: `${EnvironmentService.apps.app}/settings`,
        icon: <HiOutlineCog6Tooth className="size-4" />,
        label: 'Settings',
        shortcut: ['⌘', 'S'],
      },
      // Admin Apps
      {
        category: 'admin',
        description: 'Govern accounts',
        href: EnvironmentService.apps.admin,
        icon: <HiOutlineCog6Tooth className="size-4" />,
        label: 'Admin',
      },
    ],
    [],
  );

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
      Object.assign(dropdownRef.current.style, {
        left: `${rect.left}px`,
        top: `${rect.bottom + 8}px`,
      });
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
  const regularApps = [...mainApps, ...creativeApps];

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <>
      <AppSwitcherTrigger
        buttonRef={buttonRef}
        currentApp={currentApp}
        isLoading={isLoading}
        isOpen={isOpen}
        logoUrl={logoUrl}
        onToggle={handleToggle}
      />

      {isOpen && (
        <AppSwitcherPanel
          adminApps={adminApps}
          currentApp={currentApp}
          dropdownRef={dropdownRef}
          regularApps={regularApps}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
