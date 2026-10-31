import type { ExtensionWorkspaceState } from '@genfeedai/contracts/interfaces';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandSelector } from '~components/settings/BrandSelector';
import { OrganizationSelector } from '~components/settings/OrganizationSelector';
import { useBrandStore } from '~store/use-brand-store';
import { useWorkspaceStore } from '~store/use-workspace-store';

const mocks = vi.hoisted(() => ({
  activateWorkspace: vi.fn().mockResolvedValue(undefined),
  selectWorkspaceBrand: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('~services/workspace.service', () => ({
  ...mocks,
  getWorkspaceState: () => ({ status: 'loading' }),
  subscribeWorkspace: () => () => undefined,
}));
vi.mock('~hooks/use-brand-voice', () => ({
  useBrandVoice: () => undefined,
}));

const ready = {
  status: 'ready',
  snapshot: {
    userId: 'qa-user',
    organizationId: 'org-one',
    organizationLabel: 'Genfeed',
    brandId: 'brand-one',
    brands: [],
    organizations: [
      {
        id: 'org-one',
        label: 'Genfeed',
        slug: 'genfeed-one',
        logoUrl: null,
        brand: null,
        isActive: true,
        isOwner: true,
      },
      {
        id: 'org-two',
        label: 'Genfeed',
        slug: 'genfeed-two',
        logoUrl: null,
        brand: null,
        isActive: false,
        isOwner: true,
      },
    ],
    revision: 1,
    isApiKey: false,
  },
} satisfies ExtensionWorkspaceState;

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  useWorkspaceStore.setState(ready, true);
  useBrandStore.setState({
    activeBrandId: 'brand-one',
    brands: [
      { id: 'brand-one', label: 'Genfeed', handle: 'genfeed' },
      { id: 'brand-two', label: 'Second brand', handle: 'second' },
      { id: 'brand-three', label: 'Third brand', handle: 'third' },
      { id: 'brand-four', label: 'Fourth brand', handle: 'fourth' },
      { id: 'brand-five', label: 'Fifth brand', handle: 'fifth' },
    ],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('shared workspace switchers', () => {
  it('distinguishes duplicate organizations and closes the menu before switching scope', async () => {
    render(<OrganizationSelector />);
    const trigger = await screen.findByRole('button', {
      name: /Switch organization/,
    });
    fireEvent.click(trigger);
    fireEvent.click(
      await screen.findByRole('option', { name: /Genfeed \(genfeed-two\)/ }),
    );
    expect(mocks.activateWorkspace).toHaveBeenCalledExactlyOnceWith('org-two');
    await waitFor(() => expect(screen.queryByRole('option')).toBeNull());
  });

  it('searches brands and preserves the existing brand selection action', async () => {
    render(<BrandSelector />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Switch brand/ }),
    );
    const search = await screen.findByPlaceholderText('Search brands…');
    fireEvent.change(search, { target: { value: 'Second' } });
    expect(screen.queryByRole('option', { name: /Genfeed/ })).toBeNull();
    fireEvent.click(
      await screen.findByRole('option', { name: /Second brand/ }),
    );
    expect(mocks.selectWorkspaceBrand).toHaveBeenCalledExactlyOnceWith(
      'brand-two',
    );
  });

  it('disables organization changes for API keys and retains active-brand selection on Escape', async () => {
    useWorkspaceStore.setState(
      { ...ready, snapshot: { ...ready.snapshot, isApiKey: true } },
      true,
    );
    const view = render(<OrganizationSelector />);
    expect(
      await screen.findByRole('button', { name: /Switch organization/ }),
    ).toBeDisabled();
    view.unmount();
    render(<BrandSelector />);
    const trigger = await screen.findByRole('button', { name: /Switch brand/ });
    fireEvent.click(trigger);
    fireEvent.keyDown(await screen.findByPlaceholderText('Search brands…'), {
      key: 'Escape',
    });
    await waitFor(() => expect(screen.queryByRole('option')).toBeNull());
    expect(mocks.selectWorkspaceBrand).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
