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
import TurboNewPane from './TurboNewPane';

const mocks = vi.hoisted(() => ({
  isIdeasEnabled: true,
  brandId: 'brand-1',
  settings: {
    hasOrganizationBilling: true,
    isReleasePreviewEnabled: true,
    hasPaidModuleSubscription: true,
    moduleOverrides: { automation: true },
  } as Record<string, unknown>,
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getService: vi.fn(),
  push: vi.fn(),
  // Projects the fake service has persisted, in creation order.
  saved: [] as Array<Record<string, unknown>>,
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

vi.mock('@/hooks/feature-flags/use-feature-flag', () => ({
  useFeatureFlag: () => mocks.isIdeasEnabled,
}));

// The rich-text editor needs a real DOM layout; a textarea keeps these tests on
// the pane's own behaviour.
vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    ariaLabel,
    isDisabled,
    onSubmit,
    onValueChange,
    placeholder,
    value,
  }: {
    ariaLabel?: string;
    isDisabled?: boolean;
    onSubmit?: () => void;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    value?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      disabled={isDisabled}
      onChange={(event) => onValueChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit?.();
        }
      }}
      placeholder={placeholder}
      value={value}
    />
  ),
}));

const WEEKLY_MIX_ANGLE =
  'A balanced week of posts: one product highlight, one practical tip, one behind-the-scenes moment and one customer-focused story.';

function resetMocks() {
  vi.clearAllMocks();
  mocks.brandId = 'brand-1';
  mocks.isIdeasEnabled = true;
  mocks.settings = {
    hasOrganizationBilling: true,
    isReleasePreviewEnabled: true,
    hasPaidModuleSubscription: true,
    moduleOverrides: { automation: true },
  };
  mocks.getService.mockResolvedValue({
    create: mocks.create,
    list: mocks.list,
    update: mocks.update,
  });
  mocks.list.mockResolvedValue([]);
  mocks.saved = [];
  mocks.create.mockImplementation(async (input: Record<string, unknown>) => {
    const project = { id: `run-${mocks.saved.length + 1}`, ...input };
    mocks.saved.push(project);
    return { id: project.id };
  });
  mocks.update.mockImplementation(
    async (id: string, patch: Record<string, unknown>) => {
      const project = mocks.saved.find((saved) => saved.id === id);
      if (project) {
        Object.assign(project, patch);
      }
      return { id };
    },
  );
}

function promptBox() {
  return screen.getByRole('textbox', { name: 'Creative angle' });
}

function typePrompt(value: string) {
  fireEvent.change(promptBox(), { target: { value } });
}

function sendButton() {
  return screen.getByRole('button', { name: 'Create project' });
}

function chooseSource(name: 'From ideas' | 'From a workflow') {
  fireEvent.click(screen.getByRole('combobox', { name: 'Project source' }));
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('TurboNewPane', () => {
  beforeEach(resetMocks);

  it('opens on ideas with the starters, an empty prompt and no workflow lookup', () => {
    render(<TurboNewPane />);

    expect(
      screen.getByRole('heading', { name: 'What should Turbo make?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Describe a topic, generate ideas, then turn them into content.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Weekly content mix/ }),
    ).toBeInTheDocument();
    expect(promptBox()).toHaveValue('');
    expect(sendButton()).toBeEnabled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('fills the prompt from a starter without creating anything', () => {
    render(<TurboNewPane />);

    fireEvent.click(screen.getByRole('button', { name: /Weekly content mix/ }));

    expect(promptBox()).toHaveValue(WEEKLY_MIX_ANGLE);
    expect(mocks.saved).toEqual([]);
  });

  it('names the project after the starter when the prompt is left as the starter', async () => {
    render(<TurboNewPane />);

    fireEvent.click(screen.getByRole('button', { name: /Weekly content mix/ }));
    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/turbo/run-1'),
    );
    expect(mocks.saved).toEqual([
      {
        id: 'run-1',
        brandId: 'brand-1',
        kind: TurboProjectKind.IDEAS,
        name: 'Weekly content mix',
        settings: {
          ideas: {
            angle: WEEKLY_MIX_ANGLE,
            count: 6,
            formats: ['image', 'video'],
          },
        },
      },
    ]);
  });

  it('saves a typed prompt as the angle and opens the new project', async () => {
    render(<TurboNewPane />);

    typePrompt('  Spring sale teasers  ');
    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/turbo/run-1'),
    );
    expect(mocks.saved).toEqual([
      {
        id: 'run-1',
        brandId: 'brand-1',
        kind: TurboProjectKind.IDEAS,
        name: 'Spring sale teasers',
        settings: {
          ideas: {
            angle: 'Spring sale teasers',
            count: 6,
            formats: ['image', 'video'],
          },
        },
      },
    ]);
  });

  it('sends the chosen formats and idea count', async () => {
    render(<TurboNewPane />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Formats' }));
    fireEvent.click(screen.getByRole('option', { name: 'Video' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Number of ideas' }));
    fireEvent.click(screen.getByRole('option', { name: '12 ideas' }));
    typePrompt('Product demos');
    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(mocks.saved).toEqual([
        expect.objectContaining({
          settings: {
            ideas: { angle: 'Product demos', count: 12, formats: ['video'] },
          },
        }),
      ]),
    );
  });

  it('lets Turbo pick the angle when the prompt is empty', async () => {
    render(<TurboNewPane />);

    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/turbo/run-1'),
    );
    expect(mocks.saved).toEqual([
      {
        id: 'run-1',
        brandId: 'brand-1',
        kind: TurboProjectKind.IDEAS,
        name: 'Untitled project',
        settings: { ideas: { count: 6, formats: ['image', 'video'] } },
      },
    ]);
  });

  it('still opens the project when saving the idea settings fails', async () => {
    mocks.update.mockRejectedValue(new Error('Settings unavailable'));
    render(<TurboNewPane />);

    typePrompt('Behind the scenes');
    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/turbo/run-1'),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses a prompt over 300 characters', () => {
    render(<TurboNewPane />);

    typePrompt('a'.repeat(301));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Keep the prompt under 300 characters.',
    );
    expect(sendButton()).toBeDisabled();
    expect(mocks.saved).toEqual([]);
  });

  it('cannot send without a brand', () => {
    mocks.brandId = '';
    render(<TurboNewPane />);

    expect(sendButton()).toBeDisabled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('turns ideas off when the turbo_ideas flag is off', async () => {
    mocks.isIdeasEnabled = false;
    render(<TurboNewPane />);

    expect(
      screen.getByText('Idea projects are not available right now.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Weekly content mix/ }),
    ).not.toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
  });

  it('keeps ideas available while Automation is off', async () => {
    mocks.settings = {
      hasOrganizationBilling: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: {},
    };
    render(<TurboNewPane />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Project source' }));
    expect(
      screen.getByRole('option', { name: 'From a workflow' }),
    ).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('option', { name: 'From ideas' }));

    typePrompt('My draft');
    fireEvent.click(sendButton());
    await waitFor(() =>
      expect(mocks.saved).toEqual([
        expect.objectContaining({
          brandId: 'brand-1',
          kind: TurboProjectKind.IDEAS,
          name: 'My draft',
        }),
      ]),
    );
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it.each([false, null, undefined])(
    'does not load workflows without a paid grant (%s) while ideas stay available',
    async (grant) => {
      mocks.settings.hasPaidModuleSubscription = grant;
      render(<TurboNewPane />);

      fireEvent.click(screen.getByRole('combobox', { name: 'Project source' }));
      expect(
        screen.getByRole('option', { name: 'From a workflow' }),
      ).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(screen.getByRole('option', { name: 'From ideas' }));

      typePrompt('Still works');
      fireEvent.click(sendButton());
      await waitFor(() =>
        expect(mocks.saved).toEqual([
          expect.objectContaining({ kind: TurboProjectKind.IDEAS }),
        ]),
      );
      expect(mocks.list).not.toHaveBeenCalled();
    },
  );

  it('does not create against a changed brand during the service lookup', async () => {
    let resolve:
      | ((service: { create: typeof mocks.create }) => void)
      | undefined;
    mocks.getService.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { rerender } = render(<TurboNewPane />);

    typePrompt('Launch week');
    fireEvent.click(sendButton());
    mocks.brandId = 'brand-2';
    rerender(<TurboNewPane />);
    await act(async () => {
      resolve?.({ create: mocks.create });
    });

    expect(mocks.saved).toEqual([]);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('offers billing and hides the composer for a subscription denial', async () => {
    mocks.create.mockRejectedValue({
      errors: [
        {
          detail: 'Please subscribe to a plan.',
          status: '403',
          title: 'Active subscription required',
        },
      ],
    });
    render(<TurboNewPane />);

    typePrompt('Launch week');
    fireEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please subscribe to a plan.',
    );
    expect(
      screen.getByRole('link', { name: 'Manage subscription' }),
    ).toHaveAttribute('href', '/acme/~/settings/subscription');
    expect(
      screen.queryByRole('textbox', { name: 'Creative angle' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create project' }),
    ).not.toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('keeps the prompt after a failed save and allows sending again', async () => {
    mocks.create.mockRejectedValueOnce({
      errors: [{ detail: 'Name is already in use', status: '422' }],
    });
    render(<TurboNewPane />);

    typePrompt('Launch week');
    fireEvent.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Name is already in use',
    );
    expect(
      screen.queryByRole('link', { name: 'Manage subscription' }),
    ).not.toBeInTheDocument();
    expect(promptBox()).toHaveValue('Launch week');

    await waitFor(() => expect(sendButton()).toBeEnabled());
    fireEvent.click(sendButton());
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/turbo/run-1'),
    );
    expect(mocks.saved).toHaveLength(1);
  });
});

describe('TurboNewPane from a workflow', () => {
  beforeEach(resetMocks);

  it('loads the brand workflows and creates a project from the chosen one', async () => {
    mocks.list.mockResolvedValue([
      { id: 'wf-1', label: 'Product spotlight' },
      { id: 'wf-2', label: 'Weekly recap' },
    ]);
    render(<TurboNewPane />);

    chooseSource('From a workflow');
    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith({ brandId: 'brand-1' }),
    );
    expect(sendButton()).toBeDisabled();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Workflow' }));
    fireEvent.click(screen.getByRole('option', { name: 'Weekly recap' }));
    await waitFor(() => expect(sendButton()).toBeEnabled());
    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/turbo/run-1'),
    );
    expect(mocks.saved).toEqual([
      {
        id: 'run-1',
        brandId: 'brand-1',
        kind: TurboProjectKind.WORKFLOW,
        name: 'Weekly recap',
        workflowId: 'wf-2',
      },
    ]);
  });

  it('points to creating a workflow, or back to ideas, when there are none', async () => {
    render(<TurboNewPane />);

    chooseSource('From a workflow');

    expect(
      await screen.findByText(
        'No saved workflows yet. Create a workflow or start from ideas.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Create a workflow' }),
    ).toHaveAttribute('href', expect.stringContaining('/acme/moonrise/'));
    expect(sendButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'From ideas' }));
    expect(promptBox()).toBeInTheDocument();
  });

  it('shows the real reason a workflow list could not load', async () => {
    mocks.list.mockRejectedValue({
      errors: [{ detail: 'Workflow access denied', status: '403' }],
    });
    render(<TurboNewPane />);

    chooseSource('From a workflow');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Workflow access denied',
    );
    expect(mocks.saved).toEqual([]);
  });

  it('ignores a stale workflow error after returning to ideas', async () => {
    let reject: ((reason: Error) => void) | undefined;
    mocks.list.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    render(<TurboNewPane />);

    chooseSource('From a workflow');
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    chooseSource('From ideas');
    await act(async () => {
      reject?.(new Error('Workflow unavailable'));
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  it('does not fetch workflows when the creator leaves while the service resolves', async () => {
    let resolve: ((service: { list: typeof mocks.list }) => void) | undefined;
    mocks.getService.mockImplementationOnce(
      () =>
        new Promise((ready) => {
          resolve = ready;
        }),
    );
    render(<TurboNewPane />);

    chooseSource('From a workflow');
    chooseSource('From ideas');
    await act(async () => {
      resolve?.({ list: mocks.list });
    });

    expect(mocks.list).not.toHaveBeenCalled();
  });
});
