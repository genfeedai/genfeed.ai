import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  seedComposer: vi.fn(),
  publishContext: vi.fn(),
  projectPages: [] as { projects: { id: string; label: string }[] }[],
  identity: { orgId: 'org', userId: 'user', sessionId: 'session' },
  brand: { id: 'brand' },
  catalog: {
    isAvailable: true,
    defaultModelKey: 'model',
    models: [
      {
        key: 'model',
        label: 'Model',
        isAvailable: true,
        inspectionCapability: 'unknown',
      },
    ],
  },
  quote: vi.fn(),
  submit: vi.fn(),
  push: vi.fn(),
  refetchProject: vi.fn(),
  settings: {
    hasOrganizationBilling: true,
    isReleasePreviewEnabled: true,
    moduleOverrides: { motion: true, editor: true },
  } as Record<string, unknown>,
  projectData: undefined as Record<string, unknown> | undefined,
  source: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.identity,
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    organizationId: mocks.identity.orgId,
    selectedBrand: mocks.brand,
    settings: mocks.settings,
    settingsLoading: false,
    refreshSettings: vi.fn(),
  }),
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => path,
    orgHref: (path: string) => `/org/~${path}`,
  }),
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
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@ui/primitives/button', () => ({
  Button: ({
    ariaLabel,
    children,
    disabled,
    icon,
    isDisabled,
    label,
    onClick,
  }: {
    ariaLabel?: string;
    children?: ReactNode;
    disabled?: boolean;
    icon?: ReactNode;
    isDisabled?: boolean;
    label?: string;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled || isDisabled}
      onClick={onClick}
    >
      {icon}
      {children ?? label}
    </button>
  ),
}));
// The TipTap editor needs a real DOM layout; a textarea keeps these tests on
// the bar's own behaviour.
vi.mock('@ui/prompt-editor/PromptEditor', () => ({
  default: ({
    ariaLabel,
    onSubmit,
    onValueChange,
    value,
  }: {
    ariaLabel?: string;
    onSubmit?: () => void;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onValueChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSubmit?.();
      }}
    />
  ),
}));
vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));
vi.mock('@ui/primitives/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}));
vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock('@/hooks/data/content/use-visual-projects', () => ({
  useVisualProjects: () => ({
    library: { data: [] },
    catalog: {
      data: mocks.catalog,
    },
    projects: { data: { pages: mocks.projectPages } },
    project: { data: mocks.projectData, refetch: mocks.refetchProject },
    source: mocks.source,
    cancel: mocks.cancel,
    quote: mocks.quote,
    submit: mocks.submit,
  }),
}));

const quote = {
  modelKey: 'model',
  isByok: false,
  authoringCredits: 1,
  inspectionCredits: 1,
  renderCredits: 1,
  maximumCredits: 3,
  settings: { width: 640, height: 360 },
  outputRequests: [{ format: 'mp4' }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity = { orgId: 'org', userId: 'user', sessionId: 'session' };
  mocks.catalog = {
    isAvailable: true,
    defaultModelKey: 'model',
    models: [
      {
        key: 'model',
        label: 'Model',
        isAvailable: true,
        inspectionCapability: 'unknown',
      },
    ],
  };
  mocks.settings = {
    hasOrganizationBilling: true,
    isReleasePreviewEnabled: true,
    moduleOverrides: { motion: true, editor: true },
  };
  mocks.projectData = undefined;
  mocks.projectPages = [];
  mocks.source.mockResolvedValue('retained source');
  mocks.quote.mockResolvedValue(quote);
  mocks.submit.mockResolvedValue({ id: 'project' });
});

import MotionNewPane from './MotionNewPane';

describe('Motion quote review', () => {
  it('hides creation and quote controls under disabled cloud defaults', () => {
    mocks.settings = {
      hasOrganizationBilling: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: {},
    };
    render(<MotionNewPane />);
    expect(screen.queryByLabelText('prompt')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'getQuote' }),
    ).not.toBeInTheDocument();
    expect(mocks.quote).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('discards an acknowledged quote across a module disable and re-enable', async () => {
    const { rerender } = render(<MotionNewPane />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    await screen.findByRole('button', { name: 'confirm' });
    fireEvent.click(screen.getByLabelText('acknowledge'));
    mocks.settings = {
      hasOrganizationBilling: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: { motion: false },
    };
    rerender(<MotionNewPane />);
    mocks.settings = {
      hasOrganizationBilling: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: { motion: true },
    };
    rerender(<MotionNewPane />);
    expect(
      screen.queryByRole('button', { name: 'confirm' }),
    ).not.toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('discards an in-flight quote after disabling Motion', async () => {
    let resolve: ((value: typeof quote) => void) | undefined;
    mocks.quote.mockImplementationOnce(
      () =>
        new Promise((accept) => {
          resolve = accept;
        }),
    );
    const { rerender } = render(<MotionNewPane />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    mocks.settings = {
      hasOrganizationBilling: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: { motion: false },
    };
    rerender(<MotionNewPane />);
    await act(async () => {
      resolve?.(quote);
    });
    mocks.settings = {
      hasOrganizationBilling: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: { motion: true },
    };
    rerender(<MotionNewPane />);
    expect(
      screen.queryByRole('button', { name: 'confirm' }),
    ).not.toBeInTheDocument();
  });

  it('requires explicit cost acknowledgment before submission and clears it when input changes', async () => {
    render(<MotionNewPane />);
    fireEvent.change(screen.getByLabelText('label'), {
      target: { value: 'Visual' },
    });
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    await screen.findByRole('button', { name: 'confirm' });
    expect(screen.getByRole('button', { name: 'confirm' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('acknowledge'));
    expect(screen.getByRole('button', { name: 'confirm' })).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Different title' },
    });
    expect(
      screen.queryByRole('button', { name: 'confirm' }),
    ).not.toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('discards an in-flight quote when the input changes', async () => {
    let resolve: (value: typeof quote) => void = () => {};
    mocks.quote.mockImplementationOnce(
      () =>
        new Promise((accept) => {
          resolve = accept;
        }),
    );
    render(<MotionNewPane />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'First' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Second' },
    });
    await act(async () => resolve(quote));
    expect(
      screen.queryByRole('button', { name: 'confirm' }),
    ).not.toBeInTheDocument();
  });
  it('clears prior actor source, props and review on authentication scope change', async () => {
    const view = render(<MotionNewPane />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Private source instruction' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    await screen.findByRole('button', { name: 'confirm' });
    mocks.identity = { orgId: 'other', userId: 'other', sessionId: 'new' };
    view.rerender(<MotionNewPane />);
    await waitFor(() =>
      expect(screen.getByLabelText('prompt')).toHaveValue(''),
    );
    expect(
      screen.queryByRole('button', { name: 'confirm' }),
    ).not.toBeInTheDocument();
  });
  it('clears a stale create conflict without fetching a project', async () => {
    mocks.quote.mockRejectedValue({
      errors: [{ detail: 'stale_visual_revision', status: '409' }],
    });
    render(<MotionNewPane />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('staleRevision');
    fireEvent.click(screen.getByRole('button', { name: 'reloadRevision' }));
    expect(mocks.refetchProject).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('keeps the generic message for a non-conflict failure', async () => {
    mocks.quote.mockRejectedValue({ unexpected: true });
    render(<MotionNewPane />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('failed');
    expect(
      screen.queryByRole('button', { name: 'reloadRevision' }),
    ).not.toBeInTheDocument();
  });
  it('renders the compose controls inside the one shared prompt bar', async () => {
    render(<MotionNewPane />);
    const bar = screen.getByTestId('motion-prompt-bar');
    expect(bar).toHaveAttribute('data-prompt-bar-composer');
    expect(within(bar).getByLabelText('prompt')).toBeInTheDocument();
    expect(within(bar).getByLabelText('label')).toBeInTheDocument();
    expect(
      within(bar).getByRole('button', { name: 'getQuote' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    const review = await screen.findByTestId('motion-quote-review');
    expect(bar).toContainElement(review);
  });
  it('requests a quote from the keyboard like every other prompt bar', async () => {
    render(<MotionNewPane />);
    const prompt = screen.getByLabelText('prompt');
    fireEvent.change(prompt, { target: { value: 'Animate a title' } });
    fireEvent.keyDown(prompt, { key: 'Enter' });
    await screen.findByRole('button', { name: 'confirm' });
    expect(mocks.quote).toHaveBeenCalledOnce();
  });
  it('keeps the send action blocked while the renderer is unavailable', () => {
    mocks.catalog = { ...mocks.catalog, isAvailable: false };
    render(<MotionNewPane />);
    expect(screen.getByRole('button', { name: 'getQuote' })).toBeDisabled();
    expect(
      within(screen.getByTestId('motion-prompt-bar')).getByRole('status'),
    ).toHaveTextContent('unavailable');
  });
  it('opens size and output settings from the toolbar, not a separate form', () => {
    render(<MotionNewPane />);
    expect(screen.queryByLabelText('PNG')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('settings'));
    expect(screen.getByLabelText('PNG')).toBeInTheDocument();
  });
  it('renders when the catalog payload omits models', () => {
    Reflect.deleteProperty(mocks.catalog, 'models');
    expect(() => render(<MotionNewPane />)).not.toThrow();
    expect(screen.getByLabelText('prompt')).toBeVisible();
  });
  it('opens the new project at its own page after the quote is approved', async () => {
    render(<MotionNewPane />);
    fireEvent.change(screen.getByLabelText('label'), {
      target: { value: 'Visual' },
    });
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    await screen.findByRole('button', { name: 'confirm' });
    fireEvent.click(screen.getByLabelText('acknowledge'));
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/motion/project'),
    );
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'create' }),
      3,
    );
  });
  it('fills the form from a starter card without asking for a quote', () => {
    render(<MotionNewPane />);
    fireEvent.click(
      screen.getByRole('button', { name: /kineticQuote\.title/ }),
    );
    expect(screen.getByLabelText('label')).toHaveValue(
      'presets.items.kineticQuote.title',
    );
    expect(
      (screen.getByLabelText('prompt') as HTMLTextAreaElement).value,
    ).toContain('kinetic typography animation');
    expect(mocks.quote).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'confirm' }),
    ).not.toBeInTheDocument();
  });

  describe('which project', () => {
    beforeEach(() => {
      mocks.projectPages = [
        {
          projects: [
            { id: 'visual-1', label: 'Launch title' },
            { id: 'visual-2', label: 'Logo sting' },
          ],
        },
      ];
    });

    it('tells the agent it is on the Motion New screen with the brand projects', () => {
      render(<MotionNewPane />);
      expect(mocks.publishContext).toHaveBeenLastCalledWith({
        app: 'motion',
        projects: [
          { id: 'visual-1', title: 'Launch title' },
          { id: 'visual-2', title: 'Logo sting' },
        ],
      });
    });

    it('asks which project a change request applies to instead of quoting a new one', () => {
      render(<MotionNewPane />);
      fireEvent.change(screen.getByLabelText('prompt'), {
        target: { value: 'revise the intro' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));

      expect(screen.getByText('projectChoiceQuestion')).toBeInTheDocument();
      expect(screen.getByText('revise the intro')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Launch title' }),
      ).toBeInTheDocument();
      expect(mocks.quote).not.toHaveBeenCalled();
    });

    it('opens the chosen project with the request ready in its agent', () => {
      render(<MotionNewPane />);
      fireEvent.change(screen.getByLabelText('prompt'), {
        target: { value: 'revise the intro' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
      fireEvent.click(screen.getByRole('button', { name: 'Logo sting' }));

      expect(mocks.seedComposer).toHaveBeenCalledWith('revise the intro');
      expect(mocks.push).toHaveBeenCalledWith('/motion/visual-2');
      expect(mocks.quote).not.toHaveBeenCalled();
    });

    it('quotes a new project when the viewer declines to pick one', async () => {
      render(<MotionNewPane />);
      fireEvent.change(screen.getByLabelText('prompt'), {
        target: { value: 'revise the intro' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
      fireEvent.click(screen.getByRole('button', { name: 'projectChoiceNew' }));

      await screen.findByRole('button', { name: 'confirm' });
      expect(mocks.quote).toHaveBeenCalledTimes(1);
    });

    it('quotes a new project for new work even when projects exist', async () => {
      render(<MotionNewPane />);
      fireEvent.change(screen.getByLabelText('prompt'), {
        target: { value: 'Animate a title' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));

      await screen.findByRole('button', { name: 'confirm' });
      expect(
        screen.queryByText('projectChoiceQuestion'),
      ).not.toBeInTheDocument();
    });
  });
});
