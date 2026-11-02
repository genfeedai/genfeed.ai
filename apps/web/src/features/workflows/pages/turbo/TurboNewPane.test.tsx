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
  listProjects: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  getService: vi.fn(),
  getWorkflowService: vi.fn(),
  push: vi.fn(),
  seedComposer: vi.fn(),
  publishContext: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@/../tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@genfeedai/agent', () => ({
  useAgentChatStore: (
    select: (state: { seedComposer: typeof mocks.seedComposer }) => unknown,
  ) => select({ seedComposer: mocks.seedComposer }),
}));

vi.mock(
  '@/hooks/agent/use-creative-app-agent-context/use-creative-app-agent-context',
  () => ({ useCreativeAppAgentContext: mocks.publishContext }),
);

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
  // The pane resolves two services: the Turbo projects API (create, update and
  // the project list the agent is told about) and the workflows API.
  useAuthedService: (factory: { name: string }) =>
    factory.name === 'createWorkflowApiService'
      ? mocks.getWorkflowService
      : mocks.getService,
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
    list: mocks.listProjects,
    update: mocks.update,
  });
  mocks.getWorkflowService.mockResolvedValue({ list: mocks.list });
  mocks.list.mockResolvedValue([]);
  mocks.listProjects.mockResolvedValue([]);
  mocks.create.mockResolvedValue({ id: 'run-1' });
  mocks.update.mockResolvedValue({ id: 'run-1' });
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
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('names the project after the starter when the prompt is left as the starter', async () => {
    render(<TurboNewPane />);

    fireEvent.click(screen.getByRole('button', { name: /Weekly content mix/ }));
    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/turbo/run-1'),
    );
    expect(mocks.create).toHaveBeenCalledWith({
      brandId: 'brand-1',
      kind: TurboProjectKind.IDEAS,
      name: 'Weekly content mix',
    });
    expect(mocks.update).toHaveBeenCalledWith('run-1', {
      settings: {
        ideas: {
          angle: WEEKLY_MIX_ANGLE,
          count: 6,
          formats: ['image', 'video'],
        },
      },
    });
  });

  it('saves a typed prompt as the angle and opens the new project', async () => {
    render(<TurboNewPane />);

    typePrompt('  Spring sale teasers  ');
    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/turbo/run-1'),
    );
    expect(mocks.create).toHaveBeenCalledWith({
      brandId: 'brand-1',
      kind: TurboProjectKind.IDEAS,
      name: 'Spring sale teasers',
    });
    expect(mocks.update).toHaveBeenCalledWith('run-1', {
      settings: {
        ideas: {
          angle: 'Spring sale teasers',
          count: 6,
          formats: ['image', 'video'],
        },
      },
    });
  });

  it('sends the chosen formats and idea count', async () => {
    render(<TurboNewPane />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Formats' }));
    fireEvent.click(screen.getByRole('option', { name: 'Video' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Number of ideas' }));
    fireEvent.click(screen.getByRole('option', { name: '12 ideas' }));
    typePrompt('Product demos');
    fireEvent.click(sendButton());

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update).toHaveBeenCalledWith('run-1', {
      settings: {
        ideas: { angle: 'Product demos', count: 12, formats: ['video'] },
      },
    });
  });

  it('lets Turbo pick the angle when the prompt is empty', async () => {
    render(<TurboNewPane />);

    fireEvent.click(sendButton());

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/turbo/run-1'),
    );
    expect(mocks.create).toHaveBeenCalledWith({
      brandId: 'brand-1',
      kind: TurboProjectKind.IDEAS,
      name: 'Untitled project',
    });
    expect(mocks.update).toHaveBeenCalledWith('run-1', {
      settings: { ideas: { count: 6, formats: ['image', 'video'] } },
    });
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
    expect(mocks.create).not.toHaveBeenCalled();
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
      expect(mocks.create).toHaveBeenCalledWith({
        brandId: 'brand-1',
        kind: TurboProjectKind.IDEAS,
        name: 'My draft',
      }),
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
        expect(mocks.create).toHaveBeenCalledWith(
          expect.objectContaining({ kind: TurboProjectKind.IDEAS }),
        ),
      );
      expect(mocks.list).not.toHaveBeenCalled();
    },
  );

  it('does not create against a changed brand during the service lookup', async () => {
    // The pane looks the service up for the project list as well as for the
    // create, so hold every lookup until the brand has changed.
    const resolvers: Array<(service: object) => void> = [];
    mocks.getService.mockImplementation(
      () =>
        new Promise((done) => {
          resolvers.push(done);
        }),
    );
    const { rerender } = render(<TurboNewPane />);

    typePrompt('Launch week');
    fireEvent.click(sendButton());
    mocks.brandId = 'brand-2';
    rerender(<TurboNewPane />);
    await act(async () => {
      for (const resolve of resolvers) {
        resolve({ create: mocks.create, list: mocks.listProjects });
      }
    });

    expect(mocks.create).not.toHaveBeenCalled();
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
    expect(mocks.create).toHaveBeenCalledTimes(2);
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
    expect(mocks.create).toHaveBeenCalledWith({
      brandId: 'brand-1',
      kind: TurboProjectKind.WORKFLOW,
      name: 'Weekly recap',
      workflowId: 'wf-2',
    });
    expect(mocks.update).not.toHaveBeenCalled();
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
    expect(mocks.create).not.toHaveBeenCalled();
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
    mocks.getWorkflowService.mockImplementationOnce(
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

  describe('which project', () => {
    const PROJECTS = [
      { id: 'project-1', name: 'Spring launch' },
      { id: 'project-2', name: 'Founder story' },
    ];

    beforeEach(() => {
      mocks.listProjects.mockResolvedValue(PROJECTS);
    });

    it('tells the agent it is on the Turbo New screen with the brand projects', async () => {
      render(<TurboNewPane />);

      await waitFor(() =>
        expect(mocks.publishContext).toHaveBeenLastCalledWith({
          app: 'turbo',
          projects: [
            { id: 'project-1', title: 'Spring launch' },
            { id: 'project-2', title: 'Founder story' },
          ],
        }),
      );
    });

    it('asks which project a change request applies to instead of creating one', async () => {
      render(<TurboNewPane />);
      await waitFor(() => expect(mocks.listProjects).toHaveBeenCalled());
      await screen.findByRole('textbox', { name: 'Creative angle' });
      await waitFor(() =>
        expect(mocks.publishContext).toHaveBeenLastCalledWith(
          expect.objectContaining({ app: 'turbo' }),
        ),
      );

      typePrompt('revise the intro');
      fireEvent.click(sendButton());

      expect(
        await screen.findByText('Which project should I apply this to?'),
      ).toBeInTheDocument();
      // The composer still holds the request; the bubble is the div copy of it.
      expect(
        screen.getByText('revise the intro', { selector: 'div' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Spring launch' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Founder story' }),
      ).toBeInTheDocument();
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it('opens the chosen project with the request ready in its agent', async () => {
      render(<TurboNewPane />);
      await waitFor(() =>
        expect(mocks.publishContext).toHaveBeenLastCalledWith(
          expect.objectContaining({ app: 'turbo' }),
        ),
      );

      typePrompt('revise the intro');
      fireEvent.click(sendButton());
      fireEvent.click(
        await screen.findByRole('button', { name: 'Founder story' }),
      );

      expect(mocks.seedComposer).toHaveBeenCalledWith('revise the intro');
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/turbo/project-2');
      expect(mocks.create).not.toHaveBeenCalled();
    });

    it('starts a new project when the viewer declines to pick one', async () => {
      render(<TurboNewPane />);
      await waitFor(() =>
        expect(mocks.publishContext).toHaveBeenLastCalledWith(
          expect.objectContaining({ app: 'turbo' }),
        ),
      );

      typePrompt('revise the intro');
      fireEvent.click(sendButton());
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Start a new project instead',
        }),
      );

      await waitFor(() =>
        expect(mocks.create).toHaveBeenCalledWith({
          brandId: 'brand-1',
          kind: TurboProjectKind.IDEAS,
          name: 'revise the intro',
        }),
      );
      expect(mocks.push).toHaveBeenCalledWith('/acme/moonrise/turbo/run-1');
    });

    it('creates a project for new work even when projects exist', async () => {
      render(<TurboNewPane />);
      await waitFor(() =>
        expect(mocks.publishContext).toHaveBeenLastCalledWith(
          expect.objectContaining({ app: 'turbo' }),
        ),
      );

      typePrompt('a week of posts about spring');
      fireEvent.click(sendButton());

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      expect(
        screen.queryByText('Which project should I apply this to?'),
      ).not.toBeInTheDocument();
    });

    it('creates a project for a change request when the brand has none', async () => {
      mocks.listProjects.mockResolvedValue([]);
      render(<TurboNewPane />);
      await waitFor(() =>
        expect(mocks.publishContext).toHaveBeenLastCalledWith({
          app: 'turbo',
          projects: [],
        }),
      );

      typePrompt('revise the intro');
      fireEvent.click(sendButton());

      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    });
  });
});
