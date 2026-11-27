import '@testing-library/jest-dom/vitest';
import type { IDesktopWorkspaceState } from '@genfeedai/contracts/desktop';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopWorkspaceSettings from './DesktopWorkspaceSettings';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('pages.desktopSettings.workspace');

  return {
    useFormatter: () => ({ dateTime: () => '27 Nov 2026, 10:02' }),
    useTranslations: () => translate,
  };
});

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [{ id: 'brand-1', label: 'Shipshitdev' }],
    organizationId: 'org-1',
  }),
}));

const mocks = vi.hoisted(() => ({
  bridge: null as null | {
    workspace: Record<string, ReturnType<typeof vi.fn>>;
  },
}));

vi.mock('@/lib/desktop/runtime', () => ({
  getDesktopBridge: () => mocks.bridge,
}));

const STATE: IDesktopWorkspaceState = {
  activeWorkspaceId: 'w1',
  projectsHome: '/Users/test/.genfeedai/projects',
  workspaces: [
    {
      brandId: 'brand-1',
      createdAt: '2026-11-27T09:00:00.000Z',
      id: 'w1',
      lastOpenedAt: '2026-11-27T10:02:00.000Z',
      name: 'Episode 12 recap',
      organizationId: 'org-1',
      path: '/Users/test/.genfeedai/projects/Episode 12 recap',
      serverId: 'cloud',
    },
    {
      brandId: null,
      createdAt: '2026-11-24T09:00:00.000Z',
      id: 'w2',
      lastOpenedAt: '2026-11-24T10:02:00.000Z',
      name: 'Raw footage',
      organizationId: null,
      path: '/Volumes/Studio/footage/raw',
      serverId: 'cloud',
    },
  ],
};

function createBridge(state: IDesktopWorkspaceState = STATE) {
  const listeners: Array<(next: IDesktopWorkspaceState) => void> = [];
  const workspace = {
    chooseProjectsHome: vi.fn().mockResolvedValue(state),
    createProject: vi.fn().mockResolvedValue(state.workspaces[0]),
    getState: vi.fn().mockResolvedValue(state),
    onDidChange: vi.fn((callback: (next: IDesktopWorkspaceState) => void) => {
      listeners.push(callback);
      return () => undefined;
    }),
    openFolder: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
    revealInFileManager: vi.fn().mockResolvedValue(undefined),
    setActive: vi.fn().mockResolvedValue(state),
  };
  mocks.bridge = { workspace };
  return { listeners, workspace };
}

describe('DesktopWorkspaceSettings', () => {
  beforeEach(() => {
    mocks.bridge = null;
  });

  it('shows the active folder with the brand whose Library it is paired with', async () => {
    createBridge();
    render(<DesktopWorkspaceSettings />);

    expect(
      (await screen.findAllByText('Episode 12 recap')).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText('/Users/test/.genfeedai/projects/Episode 12 recap')
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('Library: Shipshitdev').length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText('Not paired with a brand')).toBeInTheDocument();
  });

  it('renders nothing outside the Desktop app', () => {
    const { container } = render(<DesktopWorkspaceSettings />);

    expect(container).toBeEmptyDOMElement();
  });

  it('opens a folder paired with the brand the user is in', async () => {
    const { workspace } = createBridge();
    render(<DesktopWorkspaceSettings />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open folder…' }),
    );

    await waitFor(() =>
      expect(workspace.openFolder).toHaveBeenCalledWith({
        brandId: 'brand-1',
        organizationId: 'org-1',
      }),
    );
  });

  it('creates a project from the typed name', async () => {
    const { workspace } = createBridge();
    render(<DesktopWorkspaceSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'New project' }));
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: '  Episode 13 recap ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(workspace.createProject).toHaveBeenCalledWith({
        brandId: 'brand-1',
        name: 'Episode 13 recap',
        organizationId: 'org-1',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument(),
    );
  });

  it('switches to another folder and forgets one', async () => {
    const { workspace } = createBridge();
    render(<DesktopWorkspaceSettings />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Raw footage' }),
    );
    await waitFor(() => expect(workspace.setActive).toHaveBeenCalledWith('w2'));

    fireEvent.click(screen.getByRole('button', { name: 'Forget Raw footage' }));
    await waitFor(() => expect(workspace.remove).toHaveBeenCalledWith('w2'));
  });

  it('follows a change pushed by Desktop', async () => {
    const { listeners } = createBridge();
    render(<DesktopWorkspaceSettings />);
    await screen.findByText('Raw footage');

    act(() => {
      for (const listener of listeners) {
        listener({ ...STATE, activeWorkspaceId: null, workspaces: [] });
      }
    });

    expect(
      await screen.findByText(
        'No workspace is open. Open a folder you already have, or start a new project.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the reason without the Electron prefix when an action fails', async () => {
    const { workspace } = createBridge();
    workspace.openFolder.mockRejectedValue(
      new Error(
        "Error invoking remote method 'desktop:workspace:openFolder': Error: That folder is not readable.",
      ),
    );
    render(<DesktopWorkspaceSettings />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Open folder…' }),
    );

    expect(
      await screen.findByText('That folder is not readable.'),
    ).toBeInTheDocument();
  });

  it('moves the projects home', async () => {
    const { workspace } = createBridge();
    render(<DesktopWorkspaceSettings />);

    const home = await screen.findByText('New projects are created in');
    fireEvent.click(
      within(home.parentElement?.parentElement as HTMLElement).getByRole(
        'button',
        { name: 'Change…' },
      ),
    );

    await waitFor(() =>
      expect(workspace.chooseProjectsHome).toHaveBeenCalled(),
    );
  });
});
