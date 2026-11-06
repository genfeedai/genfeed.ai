import '@testing-library/jest-dom/vitest';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContentRunDetailPage from './content-run-detail';

const mocks = vi.hoisted(() => ({
  createRemixPack: vi.fn(),
  findOne: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createRemixPack: mocks.createRemixPack,
    findOne: mocks.findOne,
  }),
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/demo${path}` }),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

function runFor(runId: string, angle: string) {
  return {
    brief: { angle },
    id: runId,
    status: 'completed',
  };
}

function render(runId = 'run-1', client = createTestQueryClient()) {
  return rtlRender(<ContentRunDetailPage runId={runId} />, {
    wrapper: queryClientWrapper(client),
  });
}

describe('ContentRunDetailPage', () => {
  beforeEach(() => {
    mocks.findOne.mockReset();
    mocks.createRemixPack.mockReset();
    mocks.findOne.mockImplementation((runId: string) =>
      Promise.resolve(runFor(runId, `Angle for ${runId}`)),
    );
  });

  it('shows the run once it loads', async () => {
    render();

    expect(screen.getByText('Loading content run…')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Angle for run-1' }),
    ).toBeInTheDocument();
  });

  it('paints the cached run at once when coming back', async () => {
    const client = createTestQueryClient();
    const firstVisit = render('run-1', client);
    await screen.findByRole('heading', { name: 'Angle for run-1' });
    firstVisit.unmount();

    mocks.findOne.mockReturnValue(new Promise(() => {}));
    render('run-1', client);

    expect(
      screen.getByRole('heading', { name: 'Angle for run-1' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading content run…')).not.toBeInTheDocument();
  });

  it('never shows one run under another run id', async () => {
    const client = createTestQueryClient();
    const firstVisit = render('run-1', client);
    await screen.findByRole('heading', { name: 'Angle for run-1' });
    firstVisit.unmount();

    mocks.findOne.mockReturnValue(new Promise(() => {}));
    render('run-2', client);

    expect(screen.getByText('Loading content run…')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Angle for run-1' }),
    ).not.toBeInTheDocument();
  });

  it('says the run could not be loaded when the first read fails', async () => {
    mocks.findOne.mockRejectedValue(new Error('down'));
    render();

    expect(
      await screen.findByText('Content run could not be loaded.'),
    ).toBeInTheDocument();
  });

  it('shows the remix pack the server returns', async () => {
    mocks.createRemixPack.mockResolvedValue(runFor('run-1', 'Remixed angle'));
    render();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Create remix pack from this content run',
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Remixed angle' }),
      ).toBeInTheDocument(),
    );
  });
});
