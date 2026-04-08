/**
 * Commands Registry
 * Default commands for the command palette
 *
 * Navigation commands use org-scoped URLs:
 * - Brand-scoped routes: /{orgSlug}/{brandSlug}/path
 * - Org-level routes (settings): /{orgSlug}/~/path
 */

import type { ICommand } from '@genfeedai/interfaces/ui/command-palette.interface';
import { EnvironmentService } from '@services/core/environment.service';
import {
  HiOutlineArrowPath,
  HiOutlineArrowRightOnRectangle,
  HiOutlineArrowUpTray,
  HiOutlineBookOpen,
  HiOutlineBuildingOffice2,
  HiOutlineChartBar,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCog6Tooth,
  HiOutlineCommandLine,
  HiOutlineCreditCard,
  HiOutlineFolderOpen,
  HiOutlineFolderPlus,
  HiOutlineHome,
  HiOutlineKey,
  HiOutlineMagnifyingGlass,
  HiOutlineMusicalNote,
  HiOutlinePaperAirplane,
  HiOutlinePhoto,
  HiOutlineUserCircle,
  HiOutlineVideoCamera,
  HiOutlineWrenchScrewdriver,
} from 'react-icons/hi2';

/**
 * Context required to build org-scoped command URLs.
 */
export interface CommandsOrgContext {
  orgSlug: string;
  brandSlug: string;
}

/**
 * Navigation helper - uses window.location for all navigation
 * This ensures consistent behavior across all apps in the platform
 */
function navigate(url: string): void {
  window.location.href = url;
}

/**
 * Navigation Commands (consolidated app structure)
 *
 * Settings routes are org-level (/{orgSlug}/~/settings/...).
 * All other routes are brand-scoped (/{orgSlug}/{brandSlug}/...).
 */
export function createNavigationCommands(
  orgSlug: string,
  brandSlug: string,
): ICommand[] {
  const appBase = EnvironmentService.apps.app;
  const brandPath = `${appBase}/${orgSlug}/${brandSlug}`;
  const orgPath = `${appBase}/${orgSlug}/~`;

  return [
    {
      action: () => {
        navigate(`${brandPath}/overview`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Content overview and dashboard',
      icon: HiOutlineHome,
      id: 'nav-overview',
      keywords: ['dashboard', 'home', 'overview'],
      label: 'Go to Overview',
      priority: 10,
      shortcut: ['⌘', '1'],
    },
    {
      action: () => {
        navigate(`${brandPath}/research/discovery`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Discover trends and research content ideas',
      icon: HiOutlineMagnifyingGlass,
      id: 'nav-research',
      keywords: ['research', 'trends', 'discover', 'content'],
      label: 'Go to Research',
      priority: 10,
      shortcut: ['⌘', '2'],
    },
    {
      action: () => {
        navigate(`${brandPath}/library/ingredients`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Manage your content library',
      icon: HiOutlineFolderOpen,
      id: 'nav-library',
      keywords: ['manager', 'library', 'files', 'assets', 'ingredients'],
      label: 'Go to Library',
      priority: 10,
      shortcut: ['⌘', '3'],
    },
    {
      action: () => {
        navigate(`${brandPath}/posts`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Publish content to social platforms',
      icon: HiOutlinePaperAirplane,
      id: 'nav-posts',
      keywords: ['publisher', 'publish', 'schedule', 'social', 'posts'],
      label: 'Go to Posts',
      priority: 10,
      shortcut: ['⌘', '4'],
    },
    {
      action: () => {
        navigate(`${brandPath}/analytics/overview`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'View performance metrics',
      icon: HiOutlineChartBar,
      id: 'nav-analytics',
      keywords: ['analytics', 'stats', 'metrics', 'insights'],
      label: 'Go to Analytics',
      priority: 10,
      shortcut: ['⌘', '5'],
    },
    {
      action: () => {
        navigate(`${brandPath}/workflows`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Manage agents, workflows, and operational runs',
      icon: HiOutlineWrenchScrewdriver,
      id: 'nav-agents',
      keywords: ['agents', 'automation', 'workflows', 'runs'],
      label: 'Go to Agents',
      priority: 10,
      shortcut: ['⌘', '6'],
    },
    {
      action: () => {
        navigate(`${orgPath}/settings/personal`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Manage your account and organization',
      icon: HiOutlineCog6Tooth,
      id: 'nav-settings',
      keywords: ['settings', 'preferences', 'config'],
      label: 'Go to Settings',
      priority: 8,
      shortcut: ['⌘', 'S'],
    },
  ];
}

/**
 * Content Generation Commands
 */
export function createGenerationCommands(
  orgSlug: string,
  brandSlug: string,
): ICommand[] {
  const appBase = EnvironmentService.apps.app;
  const brandPath = `${appBase}/${orgSlug}/${brandSlug}`;

  return [
    {
      action: () => {
        navigate(`${brandPath}/studio/video`);
      },
      category: 'generation',
      description: 'Create a new AI video',
      icon: HiOutlineVideoCamera,
      id: 'gen-video',
      keywords: ['video', 'generate', 'create', 'ai'],
      label: 'Generate Video',
      priority: 9,
      shortcut: ['⌘', 'Shift', 'V'],
    },
    {
      action: () => {
        navigate(`${brandPath}/studio/image`);
      },
      category: 'generation',
      description: 'Create a new AI image',
      icon: HiOutlinePhoto,
      id: 'gen-image',
      keywords: ['image', 'generate', 'create', 'ai', 'picture'],
      label: 'Generate Image',
      priority: 9,
      shortcut: ['⌘', 'Shift', 'I'],
    },
    {
      action: () => {
        navigate(`${brandPath}/studio/music`);
      },
      category: 'generation',
      description: 'Create AI music and audio',
      icon: HiOutlineMusicalNote,
      id: 'gen-music',
      keywords: ['music', 'audio', 'generate', 'sound'],
      label: 'Generate Music',
      priority: 8,
      shortcut: ['⌘', 'Shift', 'M'],
    },
    {
      action: () => {
        navigate(`${brandPath}/studio/avatar`);
      },
      category: 'generation',
      description: 'Create AI avatars',
      icon: HiOutlineUserCircle,
      id: 'gen-avatar',
      keywords: ['avatar', 'character', 'generate', 'ai'],
      label: 'Generate Avatar',
      priority: 8,
      shortcut: ['⌘', 'Shift', 'A'],
    },
  ];
}

/**
 * Content Management Commands
 */
export function createContentCommands(
  orgSlug: string,
  brandSlug: string,
): ICommand[] {
  const appBase = EnvironmentService.apps.app;
  const brandPath = `${appBase}/${orgSlug}/${brandSlug}`;

  return [
    {
      action: () => {
        navigate(`${brandPath}/library/ingredients`);
      },
      category: 'content',
      description: 'Find content in your library',
      icon: HiOutlineMagnifyingGlass,
      id: 'content-search',
      keywords: ['search', 'find', 'content', 'library'],
      label: 'Search Content',
      priority: 8,
      shortcut: ['⌘', 'F'],
    },
    {
      action: () => {
        // Trigger upload modal
        const uploadButton = document.querySelector('[data-upload-button]');
        if (uploadButton instanceof HTMLElement) {
          uploadButton.click();
        }
      },
      category: 'content',
      description: 'Upload images, videos, or audio',
      icon: HiOutlineArrowUpTray,
      id: 'content-upload',
      keywords: ['upload', 'import', 'files', 'media'],
      label: 'Upload Files',
      priority: 7,
      shortcut: ['⌘', 'U'],
    },
    {
      action: () => {
        // Trigger new folder modal
        const newFolderButton = document.querySelector(
          '[data-new-folder-button]',
        );
        if (newFolderButton instanceof HTMLElement) {
          newFolderButton.click();
        }
      },
      category: 'content',
      description: 'Organize content in folders',
      icon: HiOutlineFolderPlus,
      id: 'content-new-folder',
      keywords: ['folder', 'organize', 'create', 'new'],
      label: 'Create Folder',
      priority: 6,
      shortcut: ['⌘', 'Shift', 'N'],
    },
  ];
}

/**
 * Settings Commands (consolidated in app.genfeed.ai)
 *
 * All settings routes are org-level (/{orgSlug}/~/settings/...).
 */
export function createSettingsCommands(orgSlug: string): ICommand[] {
  const appBase = EnvironmentService.apps.app;
  const orgPath = `${appBase}/${orgSlug}/~`;
  const isBillingEnabled = Boolean(process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY);

  return [
    {
      action: () => {
        navigate(`${orgPath}/settings/personal`);
      },
      category: 'settings',
      description: 'Manage your account preferences',
      icon: HiOutlineUserCircle,
      id: 'settings-personal',
      keywords: ['account', 'settings', 'profile', 'user', 'personal'],
      label: 'Personal Settings',
      priority: 6,
    },
    {
      action: () => {
        navigate(`${orgPath}/settings/organization`);
      },
      category: 'settings',
      description: 'Manage organization settings, billing, and integrations',
      icon: HiOutlineBuildingOffice2,
      id: 'settings-org',
      keywords: ['organization', 'settings', 'team', 'billing', 'integrations'],
      label: 'Organization Settings',
      priority: 6,
    },
    {
      action: () => {
        navigate(`${orgPath}/settings/brands`);
      },
      category: 'settings',
      description: 'Manage brands and social accounts',
      icon: HiOutlineKey,
      id: 'settings-brands',
      keywords: ['brands', 'social', 'accounts', 'credentials'],
      label: 'Brand Management',
      priority: 6,
    },
    {
      action: () => {
        navigate(
          `${orgPath}${
            isBillingEnabled
              ? '/settings/organization/billing'
              : '/settings/organization/api-keys'
          }`,
        );
      },
      category: 'settings',
      description: isBillingEnabled
        ? 'Manage billing and plan'
        : 'Manage API keys and provider access',
      icon: HiOutlineCreditCard,
      id: 'settings-billing',
      keywords: isBillingEnabled
        ? ['billing', 'subscription', 'plan', 'payment']
        : ['api keys', 'providers', 'credentials', 'integrations'],
      label: isBillingEnabled
        ? 'Billing & Subscription'
        : 'API Keys & Providers',
      priority: 6,
    },
    {
      action: () => {
        navigate(`${orgPath}/settings/admin`);
      },
      category: 'settings',
      description: 'Manage customer-facing admin settings in the main app',
      icon: HiOutlineWrenchScrewdriver,
      id: 'settings-admin',
      keywords: ['admin', 'settings', 'organization', 'workspace'],
      label: 'Admin Settings',
      priority: 6,
    },
  ];
}

/**
 * Help Commands
 */
export function createHelpCommands(orgSlug: string): ICommand[] {
  const appBase = EnvironmentService.apps.app;
  const orgPath = `${appBase}/${orgSlug}/~`;

  return [
    {
      action: () => {
        window.open('https://docs.genfeed.ai', '_blank');
      },
      category: 'help',
      description: 'Open documentation',
      icon: HiOutlineBookOpen,
      id: 'help-docs',
      keywords: ['help', 'docs', 'documentation', 'guide'],
      label: 'Documentation',
      priority: 5,
      shortcut: ['⌘', '?'],
    },
    {
      action: () => {
        // Trigger support chat
        if (typeof window !== 'undefined' && 'Intercom' in window) {
          (
            window as unknown as { Intercom: (command: string) => void }
          ).Intercom('show');
        }
      },
      category: 'help',
      description: 'Get help from our team',
      icon: HiOutlineChatBubbleLeftRight,
      id: 'help-support',
      keywords: ['support', 'help', 'contact', 'chat'],
      label: 'Contact Support',
      priority: 5,
    },
    {
      action: () => {
        navigate(`${orgPath}/settings/help`);
      },
      category: 'help',
      description: 'View all keyboard shortcuts',
      icon: HiOutlineCommandLine,
      id: 'help-shortcuts',
      keywords: ['shortcuts', 'keyboard', 'hotkeys'],
      label: 'Keyboard Shortcuts',
      priority: 5,
    },
  ];
}

/**
 * Quick Actions (no org context needed)
 */
export const quickActionCommands: ICommand[] = [
  {
    action: () => {
      window.location.href = '/logout';
    },
    category: 'actions',
    description: 'Log out of your account',
    icon: HiOutlineArrowRightOnRectangle,
    id: 'action-logout',
    keywords: ['logout', 'sign out', 'exit'],
    label: 'Sign Out',
    priority: 4,
  },
  {
    action: () => {
      window.location.reload();
    },
    category: 'actions',
    description: 'Reload current page',
    icon: HiOutlineArrowPath,
    id: 'action-refresh',
    keywords: ['refresh', 'reload', 'update'],
    label: 'Refresh Page',
    priority: 3,
    shortcut: ['⌘', 'R'],
  },
];

/**
 * Build all default commands for a given org/brand context.
 */
export function createDefaultCommands(
  orgSlug: string,
  brandSlug: string,
): ICommand[] {
  return [
    ...createNavigationCommands(orgSlug, brandSlug),
    ...createGenerationCommands(orgSlug, brandSlug),
    ...createContentCommands(orgSlug, brandSlug),
    ...createSettingsCommands(orgSlug),
    ...createHelpCommands(orgSlug),
    ...quickActionCommands,
  ];
}

/**
 * Register all default commands for a given org/brand context.
 */
export function registerDefaultCommands(
  orgSlug: string,
  brandSlug: string,
): void {
  // Import and register commands dynamically
  const {
    CommandPaletteService,
  } = require('@services/core/command-palette.service');
  CommandPaletteService.registerCommands(
    createDefaultCommands(orgSlug, brandSlug),
  );
}
