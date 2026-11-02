import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    projects: { data: { pages: [] } },
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
  mocks.source.mockResolvedValue('retained source');
  mocks.quote.mockResolvedValue(quote);
  mocks.submit.mockResolvedValue({ id: 'project' });
});

import MotionProjectView from './MotionProjectView';

describe('Motion project view', () => {
  it('preserves saved outputs and source reads while new Motion work is disabled', async () => {
    mocks.settings = {
      hasOrganizationBilling: true,
      isReleasePreviewEnabled: true,
      moduleOverrides: {},
    };
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
    render(<MotionProjectView projectId="saved" />);
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
  it('offers a reload when the project revision is stale', async () => {
    mocks.quote.mockRejectedValue({
      errors: [{ detail: 'stale_visual_revision', status: '409' }],
    });
    render(<MotionProjectView projectId="saved" />);
    fireEvent.change(screen.getByLabelText('prompt'), {
      target: { value: 'Animate a title' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'getQuote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('staleRevision');
    fireEvent.click(screen.getByRole('button', { name: 'reloadRevision' }));
    expect(mocks.refetchProject).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
