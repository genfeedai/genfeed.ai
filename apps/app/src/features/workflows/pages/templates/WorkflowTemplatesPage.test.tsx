import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowTemplate } from '@/features/workflows/services/workflow-api';
import WorkflowTemplatesPage from './WorkflowTemplatesPage';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  href: vi.fn((path: string) => `/demo/FUDNEWS${path}`),
  listSystemCatalog: vi.fn(),
  listTemplates: vi.fn(),
  replace: vi.fn(),
}));

const POST_HARD_CUT_TEMPLATE = {
  category: 'social',
  changeSummary: 'Uses action-backed workflow nodes.',
  description: 'Post to every social channel at once.',
  edges: [],
  icon: '',
  id: 'tpl-1',
  name: 'Social blast',
  nodes: [
    {
      data: {
        config: { actionId: 'social.publish' },
        label: 'Publish social post',
      },
      id: 'publish-social-post',
      position: { x: 0, y: 0 },
      type: 'genfeedAction',
    },
  ],
  version: 1,
} satisfies WorkflowTemplate;

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
    mocks.listTemplates.mockResolvedValue([POST_HARD_CUT_TEMPLATE]);
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
    expect(screen.queryByTestId('templates-skeleton')).toBeNull();

    resolveTemplates([]);
    await waitFor(() => {
      expect(screen.queryByTestId('templates-skeleton')).toBeNull();
    });
  });

  it('renders the post-hard-cut template payload without legacy steps', async () => {
    render(<WorkflowTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Social blast')).toBeInTheDocument();
    });
    expect(screen.getByText('Daily digest')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use Template' })).toHaveAttribute(
      'href',
      '/demo/FUDNEWS/automation/workflows/templates?template=tpl-1',
    );
    expect(screen.queryByText('1 steps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('templates-skeleton')).toBeNull();
  });
});
