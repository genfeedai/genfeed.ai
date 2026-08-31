/**
 * Commands Registry
 * Default commands for the command palette
 *
 * Navigation commands use canonical scoped URLs:
 * - Brand-scoped routes: /{orgSlug}/{brandSlug}/path
 * - Org-level routes: /{orgSlug}/~/path
 * - Personal settings: /settings
 */

import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import type { ICommand } from '@genfeedai/interfaces/ui/command-palette.interface';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { CommandPaletteService } from '@services/core/command-palette.service';
import { EnvironmentService } from '@services/core/environment.service';
import {
  BookOpen,
  Building2,
  ChartColumn,
  CircleUser,
  CreditCard,
  FolderOpen,
  FolderPlus,
  House as Home,
  Image,
  Key,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Music,
  RefreshCw,
  Search,
  Send,
  Settings,
  Terminal,
  Upload,
  Video,
  Wrench,
} from 'lucide-react';

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
 * Settings routes are scoped by owner: /settings for personal,
 * /{orgSlug}/~/settings for organization, and
 * /{orgSlug}/{brandSlug}/settings for brand.
 * All other routes are brand-scoped (/{orgSlug}/{brandSlug}/...).
 */
export function createNavigationCommands(
  orgSlug: string,
  brandSlug: string,
): ICommand[] {
  const appBase = EnvironmentService.apps.app;
  const brandPath = `${appBase}/${orgSlug}/${brandSlug}`;

  return [
    {
      action: () => {
        navigate(`${brandPath}/overview`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Content overview and dashboard',
      icon: Home,
      id: 'nav-overview',
      keywords: ['dashboard', 'home', 'overview'],
      label: 'Go to Overview',
      priority: 10,
      shortcut: ['⌘', '1'],
    },
    {
      action: () => {
        navigate(`${brandPath}/discovery/overview`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Research trends and content ideas',
      icon: Search,
      id: 'nav-discovery',
      keywords: ['discover', 'research', 'trends', 'content'],
      label: 'Go to Discovery',
      priority: 10,
      shortcut: ['⌘', '2'],
    },
    {
      action: () => {
        navigate(`${brandPath}/library`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Manage your content library',
      icon: FolderOpen,
      id: 'nav-library',
      keywords: ['manager', 'library', 'files', 'assets', 'ingredients'],
      label: 'Go to Library',
      priority: 10,
      shortcut: ['⌘', '3'],
    },
    {
      action: () => {
        navigate(`${brandPath}/library/moodboard`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Arrange all your generated assets on one canvas',
      icon: LayoutGrid,
      id: 'nav-moodboard',
      keywords: ['mood', 'board', 'moodboard', 'canvas', 'gallery', 'assets'],
      label: 'Go to Mood Board',
      priority: 9,
      shortcut: ['⌘', '7'],
    },
    {
      action: () => {
        navigate(`${brandPath}/publishing`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Manage drafts, approvals, and scheduled posts',
      icon: Send,
      id: 'nav-publishing',
      keywords: ['publishing', 'publish', 'schedule', 'social', 'posts'],
      label: 'Go to Publishing',
      priority: 10,
      shortcut: ['⌘', '4'],
    },
    {
      action: () => {
        navigate(`${brandPath}/analytics`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'View performance metrics',
      icon: ChartColumn,
      id: 'nav-analytics',
      keywords: ['analytics', 'stats', 'metrics', 'insights'],
      label: 'Go to Analytics',
      priority: 10,
      shortcut: ['⌘', '5'],
    },
    {
      action: () => {
        navigate(`${brandPath}/automation/workflows`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Manage agents, workflows, and operational runs',
      icon: Wrench,
      id: 'nav-automation',
      keywords: ['agents', 'automation', 'workflows', 'runs'],
      label: 'Go to Automation',
      priority: 10,
      shortcut: ['⌘', '6'],
    },
    {
      action: () => {
        navigate(`${appBase}/settings`);
      },
      category: 'navigation',
      condition: () => EnvironmentService.currentApp !== 'app',
      description: 'Manage your account and organization',
      icon: Settings,
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

  // One-off generation is Agent-first: Studio no longer has standalone
  // image/video/avatar/music prompt bars, so each command opens a new Agent
  // thread seeded with the matching intent.
  const generateInAgent = (prompt: string) => () => {
    navigate(`${brandPath}${buildAgentPromptHref(prompt)}`);
  };

  return [
    {
      action: generateInAgent('Generate a new video for my brand.'),
      category: 'generation',
      description: 'Create a new AI video',
      icon: Video,
      id: 'gen-video',
      keywords: ['video', 'generate', 'create', 'ai'],
      label: 'Generate Video',
      priority: 9,
      shortcut: ['⌘', 'Shift', 'V'],
    },
    {
      action: generateInAgent('Generate a new image for my brand.'),
      category: 'generation',
      description: 'Create a new AI image',
      icon: Image,
      id: 'gen-image',
      keywords: ['image', 'generate', 'create', 'ai', 'picture'],
      label: 'Generate Image',
      priority: 9,
      shortcut: ['⌘', 'Shift', 'I'],
    },
    {
      action: generateInAgent('Generate new music or audio for my brand.'),
      category: 'generation',
      description: 'Create AI music and audio',
      icon: Music,
      id: 'gen-music',
      keywords: ['music', 'audio', 'generate', 'sound'],
      label: 'Generate Music',
      priority: 8,
      shortcut: ['⌘', 'Shift', 'M'],
    },
    {
      action: generateInAgent('Generate a new AI avatar for my brand.'),
      category: 'generation',
      description: 'Create AI avatars',
      icon: CircleUser,
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
        navigate(`${brandPath}/library`);
      },
      category: 'content',
      description: 'Find content in your library',
      icon: Search,
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
      icon: Upload,
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
      icon: FolderPlus,
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
 */
export function createSettingsCommands(orgSlug: string): ICommand[] {
  const appBase = EnvironmentService.apps.app;
  const orgPath = `${appBase}/${orgSlug}/~`;
  const isBillingEnabled = hasOrganizationBillingHint();

  return [
    {
      action: () => {
        navigate(`${appBase}/settings`);
      },
      category: 'settings',
      description: 'Manage your account preferences',
      icon: CircleUser,
      id: 'settings-personal',
      keywords: ['account', 'settings', 'profile', 'user', 'personal'],
      label: 'Personal Settings',
      priority: 6,
    },
    {
      action: () => {
        navigate(`${orgPath}/settings`);
      },
      category: 'settings',
      description: 'Manage organization settings, billing, and integrations',
      icon: Building2,
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
      icon: Key,
      id: 'settings-brands',
      keywords: ['brands', 'social', 'accounts', 'credentials'],
      label: 'Brand Management',
      priority: 6,
    },
    {
      action: () => {
        navigate(
          `${orgPath}${
            isBillingEnabled ? '/settings/subscription' : '/settings/credits'
          }`,
        );
      },
      category: 'settings',
      description: isBillingEnabled
        ? 'Manage subscription and plan'
        : 'Buy and manage credits',
      icon: CreditCard,
      id: 'settings-billing',
      keywords: isBillingEnabled
        ? ['billing', 'subscription', 'plan', 'payment']
        : ['credits', 'billing', 'top up', 'payment'],
      label: isBillingEnabled ? 'Subscription' : 'Credits',
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
      icon: BookOpen,
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
      icon: MessageSquare,
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
      icon: Terminal,
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
    icon: LogOut,
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
    icon: RefreshCw,
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
 *
 * Returns the ids that were actually registered so callers can
 * unregister them on unmount (see useDefaultCommandsRegistration).
 */
export function registerDefaultCommands(
  orgSlug: string,
  brandSlug: string,
): string[] {
  return CommandPaletteService.registerCommands(
    createDefaultCommands(orgSlug, brandSlug),
  );
}
