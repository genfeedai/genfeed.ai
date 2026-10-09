import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
  replace: vi.fn(),
  refetchProject: vi.fn(),
  search: '',
  settings: {
    hasOrganizationBilling: true,
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
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
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
vi.mock('@hooks/data/content/use-visual-projects', () => ({
  useVisualProjects: () => ({
    library: { data: [] },
    catalog: {
      data: mocks.catalog,
    },
    projects: { data: { pages: [] } },
    project: { data: mocks.projectData, refetch: mocks.refetchProject },
    source: mocks.source,
    cancel: mocks.cancel,
    quote: mocks.quote,
    submit: mocks.submit,
  }),
}));

import MotionContent from './content';

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
  mocks.search = '';
  mocks.settings = {
    hasOrganizationBilling: true,
    moduleOverrides: { motion: true, editor: true },
  };
  mocks.projectData = undefined;
  mocks.source.mockResolvedValue('retained source');
  mocks.quote.mockResolvedValue(quote);
  mocks.submit.mockResolvedValue({ id: 'project' });
});
describe('Motion quote review', () => {
  it('hides creation and quote controls under disabled cloud defaults', () => {
    mocks.settings = { hasOrganizationBilling: true, moduleOverrides: {} };
    render(<MotionContent />);
    expect(screen.queryByLabelText('prompt')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'getQuote' }),
    ).not.toBeInTheDocument();
    expect(mocks.quote).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('preserves saved outputs and source reads while new Motion work is disabled', async () => {
    mocks.settings = { hasOrganizationBilling: true, moduleOverrides: {} };
    mocks.search = 'project=saved';
    mocks.projectData = {
      id: 'saved',
      label: 'Saved motion',
      currentRevision: 1,
      nextRevisionCursor: null,
      revisions: [
        {
          id: 'revision',
          number: 1,
          status: 'completed',
          progress: 100,
          consumedCredits: 3,
          maximumCredits: 3,
          rendererVersion: '1',
          modelKey: 'model',
          hasSource: true,
          props: {},
          outputRequests: [{ format: 'png', frame: 0 }],
          outputs: [
            {
              format: 'png',
              ingredientId: 'asset',
              url: '/retained.png',
              width: 640,
              height: 360,
            },
          ],
        },
      ],
    };
    render(<MotionContent />);
    expect(screen.getByText('Saved motion')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'download' })).toHaveAttribute(
      'href',
      '/retained.png',
    );
    expect(
      screen.queryByRole('button', { name: 'quoteExport' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'loadProps' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'viewSource' }));
    await waitFor(() => expect(mocks.source).toHaveBeenCalledWith(1));
    expect(screen.getByLabelText('retainedSource')).toHaveValue(
      'retained source',
    );
    expect(mocks.quote).not.toHaveBeenCalled();
  });
  it('discards an acknowledged quote across a module disable and re-enable', async () => {
    const { rerender } = render(<MotionContent />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    await screen.findByRole('button', { name: 'confirm' });
    fireEvent.click(screen.getByLabelText('acknowledge'));
    mocks.settings = {
      hasOrganizationBilling: true,
      moduleOverrides: { motion: false },
    };
    rerender(<MotionContent />);
    mocks.settings = {
      hasOrganizationBilling: true,
      moduleOverrides: { motion: true },
    };
    rerender(<MotionContent />);
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
    const { rerender } = render(<MotionContent />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    mocks.settings = {
      hasOrganizationBilling: true,
      moduleOverrides: { motion: false },
    };
    rerender(<MotionContent />);
    await act(async () => {
      resolve?.(quote);
    });
    mocks.settings = {
      hasOrganizationBilling: true,
      moduleOverrides: { motion: true },
    };
    rerender(<MotionContent />);
    expect(
      screen.queryByRole('button', { name: 'confirm' }),
    ).not.toBeInTheDocument();
  });

  it('requires explicit cost acknowledgment before submission and clears it when input changes', async () => {
    render(<MotionContent />);
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
    render(<MotionContent />);
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
    const view = render(<MotionContent />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Private source instruction' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    await screen.findByRole('button', { name: 'confirm' });
    mocks.identity = { orgId: 'other', userId: 'other', sessionId: 'new' };
    view.rerender(<MotionContent />);
    await waitFor(() =>
      expect(screen.getByLabelText('prompt')).toHaveValue(''),
    );
    expect(
      screen.queryByRole('button', { name: 'confirm' }),
    ).not.toBeInTheDocument();
  });
  it('offers a reload when the project revision is stale', async () => {
    mocks.search = 'project=project-1';
    mocks.quote.mockRejectedValue({
      errors: [{ detail: 'stale_visual_revision', status: '409' }],
    });
    render(<MotionContent />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('staleRevision');
    fireEvent.click(screen.getByRole('button', { name: 'reloadRevision' }));
    expect(mocks.refetchProject).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('clears a stale create conflict without fetching a project', async () => {
    mocks.quote.mockRejectedValue({
      errors: [{ detail: 'stale_visual_revision', status: '409' }],
    });
    render(<MotionContent />);
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
    render(<MotionContent />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('failed');
    expect(
      screen.queryByRole('button', { name: 'reloadRevision' }),
    ).not.toBeInTheDocument();
  });
  it('renders when the catalog payload omits models', () => {
    Reflect.deleteProperty(mocks.catalog, 'models');
    expect(() => render(<MotionContent />)).not.toThrow();
    expect(screen.getByRole('heading', { name: 'title' })).toBeVisible();
  });
});
