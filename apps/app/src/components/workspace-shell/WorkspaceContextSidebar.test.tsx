import type { ContextSidebarContextValue } from '@genfeedai/props/ui/context-sidebar.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { Drawer, DrawerContent } from '@ui/primitives/drawer';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceContextSidebarDrawerBody } from './WorkspaceContextSidebar';

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
