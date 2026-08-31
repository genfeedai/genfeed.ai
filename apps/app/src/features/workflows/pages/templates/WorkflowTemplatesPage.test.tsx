import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowTemplatesPage from './WorkflowTemplatesPage';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  href: vi.fn((path: string) => `/demo/FUDNEWS${path}`),
  listSystemCatalog: vi.fn(),
  listTemplates: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: mocks.href }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children?: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('WorkflowTemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTemplates.mockResolvedValue([
      {
        category: 'social',
        description: 'Post to every social channel at once.',
        icon: '',
        id: 'tpl-1',
        name: 'Social blast',
        steps: [{ id: 'step-1' }],
      },
    ]);
    mocks.listSystemCatalog.mockResolvedValue([
      {
        canonicalId: 'system-1',
        description: 'App-owned automation.',
        family: 'content',
        icon: '',
        installable: true,
        installed: false,
        label: 'Daily digest',
      },
    ]);
    mocks.getService.mockResolvedValue({
      create: vi.fn(),
      installSystemCatalog: vi.fn(),
      listSystemCatalog: mocks.listSystemCatalog,
      listTemplates: mocks.listTemplates,
    });
  });

  it('keeps the category tab bar and heading mounted while templates are still loading', async () => {
    let resolveTemplates: (value: unknown[]) => void = () => {};
    mocks.listTemplates.mockReturnValue(
      new Promise((resolve) => {
        resolveTemplates = resolve;
      }),
    );

    render(<WorkflowTemplatesPage />);

    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'All Templates' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('templates-content')).toBeInTheDocument();
    expect(screen.getByTestId('templates-skeleton')).toBeInTheDocument();

    resolveTemplates([]);
    await waitFor(() => {
      expect(screen.queryByTestId('templates-skeleton')).toBeNull();
    });
  });

  it('renders templates and the installable system catalog once loaded', async () => {
    render(<WorkflowTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Social blast')).toBeInTheDocument();
    });
    expect(screen.getByText('Daily digest')).toBeInTheDocument();
    expect(screen.queryByTestId('templates-skeleton')).toBeNull();
  });
});
