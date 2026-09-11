// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mock objects so they're available when vi.mock factories run
const { mockEnvironmentService, mockRegisterCommands } = vi.hoisted(() => ({
  mockEnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
    currentApp: 'app',
  },
  mockRegisterCommands: vi.fn((commands: { id: string }[]): string[] =>
    commands.map((command) => command.id),
  ),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: mockEnvironmentService,
}));

vi.mock('@services/core/command-palette.service', () => ({
  CommandPaletteService: {
    registerCommands: mockRegisterCommands,
  },
}));

// Import after mocks
import {
  createContentCommands,
  createDefaultCommands,
  createGeneralHelpCommands,
  createGenerationCommands,
  createNavigationCommands,
  createOrgHelpCommands,
  createOrgSettingsCommands,
  createPersonalSettingsCommands,
  quickActionCommands,
  registerDefaultCommands,
} from '@services/core/commands.registry';

const TEST_ORG = 'test-org';
const TEST_BRAND = 'test-brand';

describe('commands.registry', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: '',
        reload: vi.fn(),
      },
    });

    // Mock alert
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  describe('createNavigationCommands', () => {
    it('should have correct number of navigation commands', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);

      expect(navigationCommands.length).toBe(8);
    });

    it('should have overview command with correct properties', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const overviewCmd = navigationCommands.find(
        (c) => c.id === 'nav-overview',
      );

      expect(overviewCmd).toBeDefined();
      expect(overviewCmd?.label).toBe('Go to Overview');
      expect(overviewCmd?.category).toBe('navigation');
      expect(overviewCmd?.keywords).toContain('dashboard');
      expect(overviewCmd?.priority).toBe(10);
      expect(overviewCmd?.shortcut).toEqual(['⌘', '1']);
    });

    it('should have library command', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const libraryCmd = navigationCommands.find((c) => c.id === 'nav-library');

      expect(libraryCmd).toBeDefined();
      expect(libraryCmd?.label).toBe('Go to Library');
      expect(libraryCmd?.keywords).toContain('library');
      expect(libraryCmd?.shortcut).toEqual(['⌘', '3']);
    });

    it('should have publishing command', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const publishingCmd = navigationCommands.find(
        (c) => c.id === 'nav-publishing',
      );

      expect(publishingCmd).toBeDefined();
      expect(publishingCmd?.label).toBe('Go to Publishing');
      expect(publishingCmd?.keywords).toContain('posts');
    });

    it('should have analytics command', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const analyticsCmd = navigationCommands.find(
        (c) => c.id === 'nav-analytics',
      );

      expect(analyticsCmd).toBeDefined();
      expect(analyticsCmd?.label).toBe('Go to Analytics');
      expect(analyticsCmd?.keywords).toContain('analytics');
    });

    it('should have automation command', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const automationCmd = navigationCommands.find(
        (c) => c.id === 'nav-automation',
      );

      expect(automationCmd).toBeDefined();
      expect(automationCmd?.keywords).toContain('workflows');
    });

    it('should have settings command', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const settingsCmd = navigationCommands.find(
        (c) => c.id === 'nav-settings',
      );

      expect(settingsCmd).toBeDefined();
      expect(settingsCmd?.label).toBe('Go to Settings');
      expect(settingsCmd?.priority).toBe(8);
    });

    it('overview action should navigate to brand-scoped overview URL', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const overviewCmd = navigationCommands.find(
        (c) => c.id === 'nav-overview',
      );

      overviewCmd?.action();

      expect(window.location.href).toBe(
        `https://app.genfeed.ai/${TEST_ORG}/${TEST_BRAND}/overview`,
      );
    });

    it('discovery action should navigate to the brand-scoped Discovery URL', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const discoveryCmd = navigationCommands.find(
        (c) => c.id === 'nav-discovery',
      );

      discoveryCmd?.action();

      expect(window.location.href).toBe(
        `https://app.genfeed.ai/${TEST_ORG}/${TEST_BRAND}/discovery/overview`,
      );
    });

    it('library action should navigate to brand-scoped library URL', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const libraryCmd = navigationCommands.find((c) => c.id === 'nav-library');

      libraryCmd?.action();

      expect(window.location.href).toBe(
        `https://app.genfeed.ai/${TEST_ORG}/${TEST_BRAND}/library`,
      );
    });

    it('automation action should navigate to the brand-scoped Automation workflows URL', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const automationCmd = navigationCommands.find(
        (c) => c.id === 'nav-automation',
      );

      automationCmd?.action();

      expect(window.location.href).toBe(
        `https://app.genfeed.ai/${TEST_ORG}/${TEST_BRAND}/automation/workflows`,
      );
    });

    it('publishing action should navigate to the brand-scoped Publishing URL', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const publishingCmd = navigationCommands.find(
        (c) => c.id === 'nav-publishing',
      );

      publishingCmd?.action();

      expect(window.location.href).toBe(
        `https://app.genfeed.ai/${TEST_ORG}/${TEST_BRAND}/publishing`,
      );
    });

    it('settings action should navigate to personal settings URL', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const settingsCmd = navigationCommands.find(
        (c) => c.id === 'nav-settings',
      );

      settingsCmd?.action();

      expect(window.location.href).toBe('https://app.genfeed.ai/settings');
    });

    it('condition should return false when already on that app', () => {
      mockEnvironmentService.currentApp = 'app';

      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const overviewCmd = navigationCommands.find(
        (c) => c.id === 'nav-overview',
      );

      expect(overviewCmd?.condition?.()).toBe(false);
    });

    it('condition should return true when on different app', () => {
      mockEnvironmentService.currentApp = 'studio';

      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);
      const overviewCmd = navigationCommands.find(
        (c) => c.id === 'nav-overview',
      );

      expect(overviewCmd?.condition?.()).toBe(true);
    });
  });

  describe('createGenerationCommands', () => {
    it('should have correct number of generation commands', () => {
      const generationCommands = createGenerationCommands(TEST_ORG, TEST_BRAND);

      expect(generationCommands.length).toBe(4);
    });

    it('should have video generation command', () => {
      const generationCommands = createGenerationCommands(TEST_ORG, TEST_BRAND);
      const videoCmd = generationCommands.find((c) => c.id === 'gen-video');

      expect(videoCmd).toBeDefined();
      expect(videoCmd?.label).toBe('Generate Video');
      expect(videoCmd?.category).toBe('generation');
      expect(videoCmd?.keywords).toContain('video');
      expect(videoCmd?.shortcut).toEqual(['⌘', 'Shift', 'V']);
    });

    it('should have image generation command', () => {
      const generationCommands = createGenerationCommands(TEST_ORG, TEST_BRAND);
      const imageCmd = generationCommands.find((c) => c.id === 'gen-image');

      expect(imageCmd).toBeDefined();
      expect(imageCmd?.label).toBe('Generate Image');
      expect(imageCmd?.keywords).toContain('image');
      expect(imageCmd?.shortcut).toEqual(['⌘', 'Shift', 'I']);
    });

    it('should have music generation command', () => {
      const generationCommands = createGenerationCommands(TEST_ORG, TEST_BRAND);
      const musicCmd = generationCommands.find((c) => c.id === 'gen-music');

      expect(musicCmd).toBeDefined();
      expect(musicCmd?.label).toBe('Generate Music');
      expect(musicCmd?.keywords).toContain('music');
    });

    it('should have avatar generation command', () => {
      const generationCommands = createGenerationCommands(TEST_ORG, TEST_BRAND);
      const avatarCmd = generationCommands.find((c) => c.id === 'gen-avatar');

      expect(avatarCmd).toBeDefined();
      expect(avatarCmd?.label).toBe('Generate Avatar');
      expect(avatarCmd?.keywords).toContain('avatar');
    });

    it.each([
      ['gen-video', 'Generate a new video for my brand.'],
      ['gen-image', 'Generate a new image for my brand.'],
      ['gen-music', 'Generate new music or audio for my brand.'],
      ['gen-avatar', 'Generate a new AI avatar for my brand.'],
    ])(
      '%s action should open a seeded brand-scoped agent thread',
      (id, prompt) => {
        const generationCommands = createGenerationCommands(
          TEST_ORG,
          TEST_BRAND,
        );
        const command = generationCommands.find((c) => c.id === id);

        command?.action();

        // Studio's standalone one-off tabs are retired — the Agent owns them.
        expect(window.location.href).toBe(
          `https://app.genfeed.ai/${TEST_ORG}/${TEST_BRAND}/agent/new?${new URLSearchParams({ prompt }).toString()}`,
        );
      },
    );
  });

  describe('createContentCommands', () => {
    it('should have correct number of content commands', () => {
      const contentCommands = createContentCommands(TEST_ORG, TEST_BRAND);

      expect(contentCommands.length).toBe(3);
    });

    it('should have search command', () => {
      const contentCommands = createContentCommands(TEST_ORG, TEST_BRAND);
      const searchCmd = contentCommands.find((c) => c.id === 'content-search');

      expect(searchCmd).toBeDefined();
      expect(searchCmd?.label).toBe('Search Content');
      expect(searchCmd?.category).toBe('content');
      expect(searchCmd?.shortcut).toEqual(['⌘', 'F']);
    });

    it('should have upload command', () => {
      const contentCommands = createContentCommands(TEST_ORG, TEST_BRAND);
      const uploadCmd = contentCommands.find((c) => c.id === 'content-upload');

      expect(uploadCmd).toBeDefined();
      expect(uploadCmd?.label).toBe('Upload Files');
      expect(uploadCmd?.keywords).toContain('upload');
      expect(uploadCmd?.shortcut).toEqual(['⌘', 'U']);
    });

    it('should have new folder command', () => {
      const contentCommands = createContentCommands(TEST_ORG, TEST_BRAND);
      const folderCmd = contentCommands.find(
        (c) => c.id === 'content-new-folder',
      );

      expect(folderCmd).toBeDefined();
      expect(folderCmd?.label).toBe('Create Folder');
      expect(folderCmd?.keywords).toContain('folder');
    });

    it('search action should navigate to brand-scoped library', () => {
      const contentCommands = createContentCommands(TEST_ORG, TEST_BRAND);
      const searchCmd = contentCommands.find((c) => c.id === 'content-search');

      searchCmd?.action();

      expect(window.location.href).toBe(
        `https://app.genfeed.ai/${TEST_ORG}/${TEST_BRAND}/library`,
      );
    });

    it('upload action should trigger upload button click', () => {
      const mockButton = document.createElement('button');
      mockButton.setAttribute('data-upload-button', '');
      mockButton.click = vi.fn();
      document.body.appendChild(mockButton);

      const contentCommands = createContentCommands(TEST_ORG, TEST_BRAND);
      const uploadCmd = contentCommands.find((c) => c.id === 'content-upload');
      uploadCmd?.action();

      expect(mockButton.click).toHaveBeenCalled();

      document.body.removeChild(mockButton);
    });

    it('new folder action should trigger new folder button click', () => {
      const mockButton = document.createElement('button');
      mockButton.setAttribute('data-new-folder-button', '');
      mockButton.click = vi.fn();
      document.body.appendChild(mockButton);

      const contentCommands = createContentCommands(TEST_ORG, TEST_BRAND);
      const folderCmd = contentCommands.find(
        (c) => c.id === 'content-new-folder',
      );
      folderCmd?.action();

      expect(mockButton.click).toHaveBeenCalled();

      document.body.removeChild(mockButton);
    });

    it('upload action should handle missing button gracefully', () => {
      const contentCommands = createContentCommands(TEST_ORG, TEST_BRAND);
      const uploadCmd = contentCommands.find((c) => c.id === 'content-upload');

      // Should not throw
      expect(() => uploadCmd?.action()).not.toThrow();
    });
  });

  describe('createPersonalSettingsCommands', () => {
    it('should have exactly the personal settings command', () => {
      const settingsCommands = createPersonalSettingsCommands();

      expect(settingsCommands.length).toBe(1);
    });

    it('should have personal settings command', () => {
      const settingsCommands = createPersonalSettingsCommands();
      const personalCmd = settingsCommands.find(
        (c) => c.id === 'settings-personal',
      );

      expect(personalCmd).toBeDefined();
      expect(personalCmd?.label).toBe('Personal Settings');
      expect(personalCmd?.category).toBe('settings');
    });

    it('personal action should navigate to personal settings URL', () => {
      const settingsCommands = createPersonalSettingsCommands();
      const personalCmd = settingsCommands.find(
        (c) => c.id === 'settings-personal',
      );

      personalCmd?.action();

      expect(window.location.href).toBe('https://app.genfeed.ai/settings');
    });
  });

  describe('createOrgSettingsCommands', () => {
    it('should have correct number of org settings commands', () => {
      const settingsCommands = createOrgSettingsCommands(TEST_ORG);

      expect(settingsCommands.length).toBe(3);
    });

    it('should have organization settings command', () => {
      const settingsCommands = createOrgSettingsCommands(TEST_ORG);
      const orgCmd = settingsCommands.find((c) => c.id === 'settings-org');

      expect(orgCmd).toBeDefined();
      expect(orgCmd?.label).toBe('Organization Settings');
    });

    it('should have brands command', () => {
      const settingsCommands = createOrgSettingsCommands(TEST_ORG);
      const brandsCmd = settingsCommands.find(
        (c) => c.id === 'settings-brands',
      );

      expect(brandsCmd).toBeDefined();
      expect(brandsCmd?.label).toBe('Brand Management');
      expect(brandsCmd?.keywords).toContain('brands');
    });

    it('should have billing command', () => {
      process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = 'test-key';
      const settingsCommands = createOrgSettingsCommands(TEST_ORG);
      const billingCmd = settingsCommands.find(
        (c) => c.id === 'settings-billing',
      );

      expect(billingCmd).toBeDefined();
      expect(billingCmd?.label).toBe('Subscription');
      expect(billingCmd?.keywords).toContain('billing');
      delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
    });

    it('brands action should navigate to org-scoped brands URL', () => {
      const settingsCommands = createOrgSettingsCommands(TEST_ORG);
      const brandsCmd = settingsCommands.find(
        (c) => c.id === 'settings-brands',
      );

      brandsCmd?.action();

      expect(window.location.href).toBe(
        `https://app.genfeed.ai/${TEST_ORG}/~/settings/brands`,
      );
    });

    it('billing action should navigate to subscription when EE is enabled', () => {
      process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = 'test-license';
      const settingsCommands = createOrgSettingsCommands(TEST_ORG);
      const billingCmd = settingsCommands.find(
        (c) => c.id === 'settings-billing',
      );

      billingCmd?.action();

      expect(window.location.href).toBe(
        `https://app.genfeed.ai/${TEST_ORG}/~/settings/subscription`,
      );
    });

    it('billing action should navigate to Credits in OSS mode', () => {
      delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
      const settingsCommands = createOrgSettingsCommands(TEST_ORG);
      const billingCmd = settingsCommands.find(
        (c) => c.id === 'settings-billing',
      );

      billingCmd?.action();

      expect(window.location.href).toBe(
        `https://app.genfeed.ai/${TEST_ORG}/~/settings/credits`,
      );
    });
  });

  describe('createGeneralHelpCommands', () => {
    it('should have correct number of general help commands', () => {
      const helpCommands = createGeneralHelpCommands();

      expect(helpCommands.length).toBe(2);
    });

    it('should have documentation command', () => {
      const helpCommands = createGeneralHelpCommands();
      const docsCmd = helpCommands.find((c) => c.id === 'help-docs');

      expect(docsCmd).toBeDefined();
      expect(docsCmd?.label).toBe('Documentation');
      expect(docsCmd?.category).toBe('help');
      expect(docsCmd?.shortcut).toEqual(['⌘', '?']);
    });

    it('should have support command', () => {
      const helpCommands = createGeneralHelpCommands();
      const supportCmd = helpCommands.find((c) => c.id === 'help-support');

      expect(supportCmd).toBeDefined();
      expect(supportCmd?.label).toBe('Contact Support');
      expect(supportCmd?.keywords).toContain('support');
    });

    it('docs action should open documentation in new tab', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      const helpCommands = createGeneralHelpCommands();
      const docsCmd = helpCommands.find((c) => c.id === 'help-docs');
      docsCmd?.action();

      expect(openSpy).toHaveBeenCalledWith('https://docs.genfeed.ai', '_blank');
    });

    it('support action should trigger Intercom when available', () => {
      const mockIntercom = vi.fn();
      (window as unknown as { Intercom: typeof mockIntercom }).Intercom =
        mockIntercom;

      const helpCommands = createGeneralHelpCommands();
      const supportCmd = helpCommands.find((c) => c.id === 'help-support');
      supportCmd?.action();

      expect(mockIntercom).toHaveBeenCalledWith('show');

      delete (window as unknown as { Intercom?: typeof mockIntercom }).Intercom;
    });

    it('support action should handle missing Intercom gracefully', () => {
      const helpCommands = createGeneralHelpCommands();
      const supportCmd = helpCommands.find((c) => c.id === 'help-support');

      // Should not throw when Intercom is not available
      expect(() => supportCmd?.action()).not.toThrow();
    });
  });

  describe('createOrgHelpCommands', () => {
    it('should have correct number of org help commands', () => {
      const helpCommands = createOrgHelpCommands(TEST_ORG);

      expect(helpCommands.length).toBe(1);
    });

    it('should have shortcuts command', () => {
      const helpCommands = createOrgHelpCommands(TEST_ORG);
      const shortcutsCmd = helpCommands.find((c) => c.id === 'help-shortcuts');

      expect(shortcutsCmd).toBeDefined();
      expect(shortcutsCmd?.label).toBe('Keyboard Shortcuts');
    });

    it('shortcuts action should navigate to org-scoped help URL', () => {
      const helpCommands = createOrgHelpCommands(TEST_ORG);
      const shortcutsCmd = helpCommands.find((c) => c.id === 'help-shortcuts');
      shortcutsCmd?.action();

      expect(window.location.href).toBe(
        `https://app.genfeed.ai/${TEST_ORG}/~/settings/help`,
      );
    });
  });

  describe('quickActionCommands', () => {
    it('should have correct number of quick action commands', () => {
      expect(quickActionCommands.length).toBe(2);
    });

    it('should have logout command', () => {
      const logoutCmd = quickActionCommands.find(
        (c) => c.id === 'action-logout',
      );

      expect(logoutCmd).toBeDefined();
      expect(logoutCmd?.label).toBe('Sign Out');
      expect(logoutCmd?.category).toBe('actions');
      expect(logoutCmd?.keywords).toContain('logout');
    });

    it('should have refresh command', () => {
      const refreshCmd = quickActionCommands.find(
        (c) => c.id === 'action-refresh',
      );

      expect(refreshCmd).toBeDefined();
      expect(refreshCmd?.label).toBe('Refresh Page');
      expect(refreshCmd?.shortcut).toEqual(['⌘', 'R']);
    });

    it('logout action should navigate to logout URL', () => {
      const logoutCmd = quickActionCommands.find(
        (c) => c.id === 'action-logout',
      );

      logoutCmd?.action();

      expect(window.location.href).toBe('/logout');
    });

    it('refresh action should reload the page', () => {
      const refreshCmd = quickActionCommands.find(
        (c) => c.id === 'action-refresh',
      );

      refreshCmd?.action();

      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  describe('createDefaultCommands', () => {
    it('should combine all command groups when org and brand are both known', () => {
      const defaultCommands = createDefaultCommands({
        brandSlug: TEST_BRAND,
        orgSlug: TEST_ORG,
      });
      const expectedLength =
        createNavigationCommands(TEST_ORG, TEST_BRAND).length +
        createGenerationCommands(TEST_ORG, TEST_BRAND).length +
        createContentCommands(TEST_ORG, TEST_BRAND).length +
        createOrgSettingsCommands(TEST_ORG).length +
        createPersonalSettingsCommands().length +
        createOrgHelpCommands(TEST_ORG).length +
        createGeneralHelpCommands().length +
        quickActionCommands.length;

      expect(defaultCommands.length).toBe(expectedLength);
    });

    it('should include commands from all categories when org and brand are both known', () => {
      const defaultCommands = createDefaultCommands({
        brandSlug: TEST_BRAND,
        orgSlug: TEST_ORG,
      });
      const categories = [...new Set(defaultCommands.map((c) => c.category))];

      expect(categories).toContain('navigation');
      expect(categories).toContain('generation');
      expect(categories).toContain('content');
      expect(categories).toContain('settings');
      expect(categories).toContain('help');
      expect(categories).toContain('actions');
    });

    it('registers only the context-free tier when neither org nor brand is known', () => {
      const defaultCommands = createDefaultCommands({
        brandSlug: '',
        orgSlug: '',
      });
      const expectedLength =
        createPersonalSettingsCommands().length +
        createGeneralHelpCommands().length +
        quickActionCommands.length;

      expect(defaultCommands.length).toBe(expectedLength);
      expect(defaultCommands.map((c) => c.id)).not.toContain('settings-org');
      expect(defaultCommands.map((c) => c.id)).not.toContain('nav-overview');
    });

    it('registers the org tier without navigation/generation/content when only an org is known', () => {
      const defaultCommands = createDefaultCommands({
        brandSlug: '',
        orgSlug: TEST_ORG,
      });
      const ids = defaultCommands.map((c) => c.id);

      expect(ids).toContain('settings-org');
      expect(ids).toContain('help-shortcuts');
      expect(ids).not.toContain('nav-overview');
      expect(ids).not.toContain('gen-video');
      expect(ids).not.toContain('content-search');
    });

    it('all commands should have required properties', () => {
      const defaultCommands = createDefaultCommands({
        brandSlug: TEST_BRAND,
        orgSlug: TEST_ORG,
      });

      defaultCommands.forEach((cmd) => {
        expect(cmd.id).toBeDefined();
        expect(cmd.label).toBeDefined();
        expect(cmd.category).toBeDefined();
        expect(cmd.action).toBeDefined();
        expect(typeof cmd.action).toBe('function');
        expect(cmd.icon).toBeDefined();
      });
    });

    it('all commands should have unique IDs', () => {
      const defaultCommands = createDefaultCommands({
        brandSlug: TEST_BRAND,
        orgSlug: TEST_ORG,
      });
      const ids = defaultCommands.map((c) => c.id);
      const uniqueIds = [...new Set(ids)];

      expect(ids.length).toBe(uniqueIds.length);
    });
  });

  describe('registerDefaultCommands', () => {
    it('should register all default commands', () => {
      registerDefaultCommands({ brandSlug: TEST_BRAND, orgSlug: TEST_ORG });

      const registeredCommands = mockRegisterCommands.mock.calls[0]?.[0];
      const defaultCommands = createDefaultCommands({
        brandSlug: TEST_BRAND,
        orgSlug: TEST_ORG,
      });

      expect(registeredCommands).toHaveLength(defaultCommands.length);
      expect(registeredCommands.map((command) => command.id)).toEqual(
        defaultCommands.map((command) => command.id),
      );
      expect(registeredCommands.map((command) => command.category)).toEqual(
        defaultCommands.map((command) => command.category),
      );
    });

    it('should call CommandPaletteService.registerCommands', () => {
      registerDefaultCommands({ brandSlug: TEST_BRAND, orgSlug: TEST_ORG });

      expect(mockRegisterCommands).toHaveBeenCalledTimes(1);
    });

    it('should return the registered command ids for cleanup', () => {
      const registeredIds = registerDefaultCommands({
        brandSlug: TEST_BRAND,
        orgSlug: TEST_ORG,
      });
      const defaultCommands = createDefaultCommands({
        brandSlug: TEST_BRAND,
        orgSlug: TEST_ORG,
      });

      expect(registeredIds).toEqual(
        defaultCommands.map((command) => command.id),
      );
    });
  });

  describe('command structure validation', () => {
    it('all navigation commands should have keywords array', () => {
      const navigationCommands = createNavigationCommands(TEST_ORG, TEST_BRAND);

      navigationCommands.forEach((cmd) => {
        expect(Array.isArray(cmd.keywords)).toBe(true);
        expect(cmd.keywords?.length).toBeGreaterThan(0);
      });
    });

    it('all generation commands should have priority', () => {
      const generationCommands = createGenerationCommands(TEST_ORG, TEST_BRAND);

      generationCommands.forEach((cmd) => {
        expect(typeof cmd.priority).toBe('number');
        expect(cmd.priority).toBeGreaterThan(0);
      });
    });

    it('commands with shortcuts should have valid shortcut format', () => {
      const defaultCommands = createDefaultCommands({
        brandSlug: TEST_BRAND,
        orgSlug: TEST_ORG,
      });

      defaultCommands
        .filter((cmd) => cmd.shortcut)
        .forEach((cmd) => {
          expect(Array.isArray(cmd.shortcut)).toBe(true);
          expect(cmd.shortcut?.length).toBeGreaterThanOrEqual(2);
          // First element should be modifier key
          expect(['⌘', 'Ctrl', 'Alt', 'Shift']).toContain(cmd.shortcut?.[0]);
        });
    });
  });
});
