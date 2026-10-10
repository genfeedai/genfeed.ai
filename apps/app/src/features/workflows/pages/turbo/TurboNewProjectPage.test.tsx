import '@testing-library/jest-dom/vitest';
import { TurboProjectKind } from '@genfeedai/contracts';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TurboNewProjectPage from './TurboNewProjectPage';

const mocks = vi.hoisted(() => ({
  isIdeasEnabled: true,
  brandId: 'brand-1',
  settings: {
    hasOrganizationBilling: true,
    hasPaidModuleSubscription: true,
    moduleOverrides: { automation: true },
  } as Record<string, unknown>,
  list: vi.fn(),
  create: vi.fn(),
  getService: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: mocks.brandId,
    settings: mocks.settings,
    settingsLoading: false,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
    orgHref: (path: string) => `/acme/~${path}`,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@hooks/feature-flags/use-feature-flag', () => ({
  useFeatureFlag: () => mocks.isIdeasEnabled,
}));

async function chooseIdeas() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Generate ideas' })[0]);
  fireEvent.change(screen.getByRole('textbox', { name: 'Turbo name' }), {
    target: { value: 'My draft' },
  });
}

describe('TurboNewProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandId = 'brand-1';
    mocks.isIdeasEnabled = true;
    mocks.settings = {
      hasOrganizationBilling: true,
      hasPaidModuleSubscription: true,
      moduleOverrides: { automation: true },
    };
    mocks.getService.mockResolvedValue({
      list: mocks.list,
      create: mocks.create,
    });
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue({ id: 'run-1' });
  });
  it('disables the ideas option when the turbo_ideas flag is off', async () => {
    mocks.isIdeasEnabled = false;
    render(<TurboNewProjectPage />);

    const fromIdeasButton = await screen.findByRole('button', {
      name: 'Generate ideas',
    });
    expect(fromIdeasButton).toBeDisabled();
    expect(
      screen.getByText('Idea projects are not available right now.'),
    ).toBeInTheDocument();
  });

  it('enables the ideas option when the turbo_ideas flag is on', async () => {
    mocks.isIdeasEnabled = true;
    render(<TurboNewProjectPage />);

    const fromIdeasButtons = screen.getAllByRole('button', {
      name: 'Generate ideas',
    });
    for (const button of fromIdeasButtons) expect(button).not.toBeDisabled();
    expect(
      screen.queryByText('Idea projects are not available right now.'),
    ).not.toBeInTheDocument();
  });
  it('waits for a brand before loading workflows', async () => {
    mocks.brandId = '';
    const { rerender } = render(<TurboNewProjectPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved workflow' }));
    expect(mocks.getService).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled();
    mocks.brandId = 'brand-1';
    rerender(<TurboNewProjectPage />);
    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith({ brandId: 'brand-1' }),
    );
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('starts with ideas and does not load unrelated workflows', () => {
    render(<TurboNewProjectPage />);
    expect(
      screen.getByRole('button', { name: 'Generate ideas' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(
        'Describe a topic, generate ideas, then turn them into content.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Run a saved workflow for each image or video you add.'),
    ).toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('keeps credit-based ideas available while Automation is off', async () => {
    mocks.settings = { hasOrganizationBilling: true, moduleOverrides: {} };
    render(<TurboNewProjectPage />);
    expect(
      screen.getByRole('button', { name: 'Saved workflow' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Saved workflow' }));
    expect(mocks.list).not.toHaveBeenCalled();
    await chooseIdeas();
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        brandId: 'brand-1',
        kind: TurboProjectKind.IDEAS,
        name: 'My draft',
      }),
    );
  });
  it('stops loading workflow choices after disabling Automation', async () => {
    const { rerender } = render(<TurboNewProjectPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved workflow' }));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    mocks.settings = {
      hasOrganizationBilling: true,
      moduleOverrides: { automation: false },
    };
    rerender(<TurboNewProjectPage />);
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled();
    expect(
      screen.queryByText(
        'No saved workflows yet. Create a workflow or start from ideas.',
      ),
    ).not.toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('does not fetch workflows after switching away while the service is resolving', async () => {
    let resolve:
      | ((service: {
          list: typeof mocks.list;
          create: typeof mocks.create;
        }) => void)
      | undefined;
    mocks.getService.mockImplementationOnce(
      () =>
        new Promise((ready) => {
          resolve = ready;
        }),
    );
    render(<TurboNewProjectPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved workflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generate ideas' }));
    await act(async () => {
      resolve?.({ list: mocks.list, create: mocks.create });
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('ignores a stale workflow loading error after returning to ideas', async () => {
    let reject: ((reason: Error) => void) | undefined;
    mocks.list.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    render(<TurboNewProjectPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved workflow' }));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Generate ideas' }));
    await act(async () => {
      reject?.(new Error('Workflow unavailable'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled();
  });

  it('shows the real workflow-loading reason', async () => {
    mocks.list.mockRejectedValue({
      errors: [{ status: '403', detail: 'Workflow access denied' }],
    });
    render(<TurboNewProjectPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Saved workflow' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Workflow access denied',
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('hides feature controls and offers centered billing for a recognized subscription denial', async () => {
    mocks.create.mockRejectedValue({
      errors: [
        {
          status: '403',
          title: 'Active subscription required',
          detail: 'Please subscribe to a plan.',
        },
      ],
    });
    render(<TurboNewProjectPage />);
    await chooseIdeas();
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please subscribe to a plan.',
    );
    expect(screen.queryByRole('textbox', { name: 'Turbo name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Generate ideas' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Saved workflow' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Manage subscription' }),
    ).toHaveAttribute('href', '/acme/~/settings/subscription');
    expect(
      screen.queryByRole('button', { name: 'Create project' }),
    ).not.toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('retains validation detail and allows an explicit corrected save with scoped navigation', async () => {
    mocks.create.mockRejectedValueOnce({
      errors: [{ status: '422', detail: 'Name is already in use' }],
    });
    render(<TurboNewProjectPage />);
    await chooseIdeas();
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Name is already in use',
    );
    expect(
      screen.queryByRole('link', { name: 'Manage subscription' }),
    ).not.toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Turbo name' }), {
      target: { value: ' Corrected draft ' },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Create project' }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/acme/moonrise/studio/turbo/run-1',
      ),
    );
    expect(mocks.create).toHaveBeenLastCalledWith({
      brandId: 'brand-1',
      kind: TurboProjectKind.IDEAS,
      name: 'Corrected draft',
    });
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
});

describe('Turbo workflow paid admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandId = 'brand-1';
    mocks.isIdeasEnabled = true;
    mocks.settings = {
      hasOrganizationBilling: true,
      moduleOverrides: { automation: true },
      hasPaidModuleSubscription: true,
    };
    mocks.getService.mockResolvedValue({
      list: mocks.list,
      create: mocks.create,
    });
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue({ id: 'run-1' });
  });
  it.each([false, null, undefined])(
    'does not load unpaid/unknown workflows while ideas remain available (%s)',
    async (grant) => {
      mocks.settings.hasPaidModuleSubscription = grant;
      render(<TurboNewProjectPage />);
      expect(
        screen.getByRole('button', { name: 'Saved workflow' }),
      ).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Generate ideas' }),
      ).not.toBeDisabled();
      expect(mocks.list).not.toHaveBeenCalled();
      if (grant === false)
        expect(
          screen.getByRole('link', { name: 'Manage subscription' }),
        ).toHaveAttribute('href', '/acme/~/settings/subscription');
      await chooseIdeas();
      fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
      await waitFor(() =>
        expect(mocks.create).toHaveBeenCalledWith(
          expect.objectContaining({ kind: TurboProjectKind.IDEAS }),
        ),
      );
    },
  );
  it('does not create against a changed brand during authenticated service lookup', async () => {
    let resolve:
      | ((service: { create: typeof mocks.create }) => void)
      | undefined;
    mocks.getService.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { rerender } = render(<TurboNewProjectPage />);
    await chooseIdeas();
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    mocks.brandId = 'brand-2';
    rerender(<TurboNewProjectPage />);
    await act(async () => {
      resolve?.({ create: mocks.create });
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
