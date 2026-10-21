import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ContextSidebarContextValue } from '@genfeedai/props/ui/context-sidebar.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { Drawer, DrawerContent } from '@ui/primitives/drawer';
import { describe, expect, it, vi } from 'vitest';
import {
  WorkspaceContextSidebarDrawerBody,
  WorkspaceContextSidebarRail,
} from './WorkspaceContextSidebar';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function buildContextSidebar(
  overrides: Partial<ContextSidebarContextValue> = {},
): ContextSidebarContextValue {
  return {
    close: vi.fn(),
    isMobileOpen: true,
    isOpen: true,
    portalTarget: null,
    registerSelection: vi.fn(() => () => undefined),
    reveal: vi.fn(),
    selection: {
      id: 'asset-1',
      kind: 'asset',
      origin: 'user',
      title: 'Launch still',
    },
    setDesktopTarget: vi.fn(),
    setIsMobileOpen: vi.fn(),
    setMobileTarget: vi.fn(),
    toggle: vi.fn(),
    ...overrides,
  };
}

describe('WorkspaceContextSidebarDrawerBody', () => {
  it('gives the drawer a named close control that closes the selection', () => {
    const contextSidebar = buildContextSidebar();

    render(
      <Drawer open>
        <DrawerContent>
          <WorkspaceContextSidebarDrawerBody contextSidebar={contextSidebar} />
        </DrawerContent>
      </Drawer>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(contextSidebar.close).toHaveBeenCalledTimes(1);
  });
});

describe('WorkspaceContextSidebarRail', () => {
  it('renders its own topbar and close control when it is the only chrome', () => {
    const contextSidebar = buildContextSidebar();

    render(<WorkspaceContextSidebarRail contextSidebar={contextSidebar} />);

    fireEvent.click(screen.getByTestId('context-sidebar-close'));
    expect(contextSidebar.close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('context-sidebar-title')).toHaveTextContent(
      'Launch still',
    );
  });

  it('shows the selection as plain content when the host owns the topbar', () => {
    const contextSidebar = buildContextSidebar();

    render(
      <WorkspaceContextSidebarRail
        contextSidebar={contextSidebar}
        isTopbarHosted
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('context-sidebar-close')).toBeNull();
    const title = screen.getByTestId('context-sidebar-title');
    expect(title).toHaveTextContent('Launch still');
    expect(title.closest('.border-b')).toBeNull();
  });
});

// The right sidebar has exactly one topbar and one close control. Details
// content never brings its own collapse button or sidebar-toggle icon.
describe('right sidebar single topbar guard', () => {
  const repoRoot = path.resolve(__dirname, '../../../../..');
  const SIDEBAR_ICONS =
    /\b(PanelRightClose|PanelRightOpen|PanelLeftClose|PanelLeftOpen)\b/;
  const ALLOWED_SIDEBAR_ICON_FILES = new Set([
    'apps/app/src/components/shell/AppProtectedTopbar.tsx',
    'apps/app/src/components/workspace-shell/WorkspaceContextSidebar.tsx',
    'packages/ui/src/components/layout/context-inspector-toggle/ContextInspectorToggle.tsx',
    'packages/ui/src/components/menus/sidebar-logo-toggle/SidebarLogoToggleButton.tsx',
    'packages/ui/src/components/menus/sidebar-toggle/SidebarToggleButton.tsx',
    'packages/ui/src/components/prompt-bars/components/essentials/PromptBarEssentials.tsx',
  ]);

  function listSources(directory: string): string[] {
    return readdirSync(directory).flatMap((entry) => {
      if (entry === 'node_modules' || entry === '.next') {
        return [];
      }
      const fullPath = path.join(directory, entry);
      if (statSync(fullPath).isDirectory()) {
        return listSources(fullPath);
      }
      return /\.tsx$/.test(entry) && !/\.(test|spec)\.tsx$/.test(entry)
        ? [fullPath]
        : [];
    });
  }

  const sources = ['apps/app', 'packages/ui/src', 'packages/pages'].flatMap(
    (root) => listSources(path.join(repoRoot, root)),
  );

  it('has the shell host the rail without a second topbar', () => {
    const shell = readFileSync(
      path.join(
        repoRoot,
        'apps/app/src/components/workspace-shell/UniversalWorkspaceShell.tsx',
      ),
      'utf8',
    );

    expect(shell).toMatch(
      /<WorkspaceContextSidebarRail[^>]*\bisTopbarHosted\b/s,
    );
  });

  it('keeps the context-sidebar close control in the rail header only', () => {
    const offenders = sources
      .filter((file) =>
        /\sdata-testid="context-sidebar-close"/.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => path.relative(repoRoot, file));

    expect(offenders).toEqual([
      'apps/app/src/components/workspace-shell/WorkspaceContextSidebar.tsx',
    ]);
  });

  it('keeps sidebar collapse icons out of detail panel content', () => {
    const offenders = sources
      .map((file) => path.relative(repoRoot, file))
      .filter(
        (file) =>
          !ALLOWED_SIDEBAR_ICON_FILES.has(file) &&
          SIDEBAR_ICONS.test(readFileSync(path.join(repoRoot, file), 'utf8')),
      );

    // Review's row actions open the sidebar from a list; they are triggers,
    // not a second close control inside it.
    expect(
      offenders.filter(
        (file) =>
          !file.endsWith('ReviewItemsTable.tsx') &&
          !file.endsWith('ReviewPostHoverPreview.tsx'),
      ),
    ).toEqual([]);
  });
});
