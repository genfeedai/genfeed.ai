/**
 * Commands Registry
 * Default commands for the command palette
 *
 * Navigation commands use canonical scoped URLs:
 * - Brand-scoped routes: /{orgSlug}/{brandSlug}/path
 * - Org-level routes: /{orgSlug}/~/path
 * - Personal settings: /settings
 */

import type { AppRailCommandsOptions } from '@genfeedai/contracts/interfaces/ui/app-rail.interface';
import type { ICommand } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { CommandPaletteService } from '@services/core/command-palette.service';
import { EnvironmentService } from '@services/core/environment.service';
import {
  BookOpen,
  CircleUser,
  FolderPlus,
  Image,
  LogOut,
  MessageSquare,
  Music,
  RefreshCw,
  Search,
  Terminal,
  Upload,
  Video,
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

/** Build app commands from the shell's visible, scoped rail registry entries. */
export function createNavigationCommands({
  items,
  commandLabel,
  navigate,
  surface,
}: AppRailCommandsOptions): ICommand[] {
  return items.map((item) => ({
    action: () => navigate(item),
    category: 'navigation',
    description: item.description,
    icon: item.app.icon,
    id: `app-rail:${surface}:${item.app.id}`,
    keywords: [item.app.id, item.label],
    label: commandLabel(item.label),
    priority: 10,
    shortcut: item.shortcut,
  }));
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
 * General Help Commands
 *
 * Needs no org/brand context — always registered (see `createDefaultCommands`).
 */
export function createGeneralHelpCommands(): ICommand[] {
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
  ];
}

/**
 * Organization-scoped Help Commands
 *
 * Only needs an org slug — registered whenever one is known, brand or not.
 */
export function createOrgHelpCommands(orgSlug: string): ICommand[] {
  const appBase = EnvironmentService.apps.app;
  const orgPath = `${appBase}/${orgSlug}/~`;

  return [
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
 * Build the default commands for the current session, tiered by how much
 * context is actually known — never gated on both an org AND a brand slug
 * being present simultaneously (that hid every command, including the
 * context-free ones, on any route missing a brand segment — #4660):
 * - always: quick actions, general help
 * - org known: org-scoped help
 * - org + brand known: generation, content
 * App navigation is registered by the rail from its visible registry entries.
 *
 * Personal/Organization/Brand settings destinations (Personal Settings,
 * Organization Settings, Brand Management, Billing) are NOT registered here.
 * They used to be coarse commands that navigated with a full page reload
 * (`window.location.href`); `useSettingsCommandsRegistration` now covers the
 * same destinations — and every other real settings page — via the shared
 * catalog with client-side navigation, so keeping a reloading duplicate here
 * would silently undo that (#4660 review).
 *
 * `orgSlug`/`brandSlug` are '' when not yet known — both tiers below simply
 * don't register rather than requiring the caller to omit them.
 */
export function createDefaultCommands({
  orgSlug,
  brandSlug,
}: CommandsOrgContext): ICommand[] {
  return [
    ...quickActionCommands,
    ...createGeneralHelpCommands(),
    ...(orgSlug ? createOrgHelpCommands(orgSlug) : []),
    ...(orgSlug && brandSlug
      ? [
          ...createGenerationCommands(orgSlug, brandSlug),
          ...createContentCommands(orgSlug, brandSlug),
        ]
      : []),
  ];
}

/**
 * Register the default commands for the current session context.
 *
 * Returns the ids that were actually registered so callers can
 * unregister them on unmount (see useDefaultCommandsRegistration).
 */
export function registerDefaultCommands(context: CommandsOrgContext): string[] {
  return CommandPaletteService.registerCommands(createDefaultCommands(context));
}
