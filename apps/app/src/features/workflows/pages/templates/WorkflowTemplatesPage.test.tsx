import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowTemplate } from '@/features/workflows/services/workflow-api';
import WorkflowTemplatesPage, { categoryLabel } from './WorkflowTemplatesPage';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  href: vi.fn((path: string) => `/demo/FUDNEWS${path}`),
  list: vi.fn(),
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

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  toBrandListParams: () => ({ brandId: 'brand-1' }),
  useCollectionScope: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'brand',
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

vi.mock('@genfeedai/contexts/ui/page-help-context', () => ({
  usePageHelp: () => ({ body: 'Template help', title: 'Templates' }),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    headerTabs,
    leading,
    right,
  }: {
    children?: ReactNode;
    headerTabs?: { tabs?: Array<{ href?: string; label: string }> };
    leading?: ReactNode;
    right?: ReactNode;
  }) => (
    <main>
      <header data-testid="section-topbar">
        {headerTabs?.tabs?.map((tab) => (
          <a key={tab.label} href={tab.href}>
            {tab.label}
          </a>
        ))}
        {leading}
        {right}
      </header>
      {children}
    </main>
  ),
}));

vi.mock('@ui/layout/section-topbar/SectionTopbar', () => ({
  default: ({
    actions,
    leading,
  }: {
    actions?: ReactNode;
    leading?: ReactNode;
  }) => (
    <header data-testid="section-topbar">
      {leading}
      {actions}
    </header>
  ),
}));

vi.mock('@ui/layout/help-popover/HelpPopover', () => ({
  default: () => (
    <button type="button" aria-label="Page help">
      Help
    </button>
  ),
}));

vi.mock('@ui/primitives/searchbar', () => ({
  default: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} />
  ),
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({
    children,
    'aria-label': ariaLabel,
  }: {
    children?: ReactNode;
    'aria-label'?: string;
  }) => (
    <button type="button" aria-label={ariaLabel}>
      {children}
    </button>
  ),
  SelectValue: () => null,
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    headerAction,
    label,
  }: {
    children?: ReactNode;
    headerAction?: ReactNode;
    label?: ReactNode;
  }) => (
    <article>
      <h3>{label}</h3>
      {headerAction}
      {children}
    </article>
  ),
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
    mocks.list.mockResolvedValue([]);
    mocks.listSystemCatalog.mockResolvedValue([
      {
        canonicalId: 'system-1',
        nodes: POST_HARD_CUT_TEMPLATE.nodes,
        edges: POST_HARD_CUT_TEMPLATE.edges,
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
      list: mocks.list,
      listSystemCatalog: mocks.listSystemCatalog,
      listTemplates: mocks.listTemplates,
    });
  });

  it('keeps search and filters mounted while templates are still loading', async () => {
    let resolveTemplates: (value: unknown[]) => void = () => {};
    mocks.listTemplates.mockReturnValue(
      new Promise((resolve) => {
        resolveTemplates = resolve;
      }),
    );

    render(<WorkflowTemplatesPage />);

    expect(
      screen.getByPlaceholderText('Search templates...'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Source' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Category' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('templates-content')).toBeInTheDocument();

    resolveTemplates([]);
    await waitFor(() => {
      expect(screen.getByTestId('templates-content')).toBeInTheDocument();
    });
  });

  it('renders catalog and templates without mixing in the saved library', async () => {
    render(<WorkflowTemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText('Social blast')).toBeInTheDocument();
    });
    expect(screen.getByText('Daily digest')).toBeInTheDocument();
    expect(screen.queryByText('My pipeline')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      '/demo/FUDNEWS/automation/workflows',
    );
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute(
      'href',
      '/demo/FUDNEWS/automation/workflows/templates',
    );
    expect(
      screen.getByRole('img', { name: 'Daily digest workflow diagram' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Social blast workflow diagram' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Use template' })).toHaveAttribute(
      'href',
      '/demo/FUDNEWS/automation/workflows/templates?template=tpl-1',
    );
    expect(screen.queryByText('1 steps')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('section-topbar')).toHaveLength(1);
  });

  it('title-cases unknown category keys', () => {
    expect(categoryLabel('ads')).toBe('Ads');
    expect(categoryLabel('agents')).toBe('Agents');
    expect(categoryLabel('analytics')).toBe('Analytics');
    expect(categoryLabel('automation')).toBe('Automation');
    expect(categoryLabel('campaigns')).toBe('Campaigns');
    expect(categoryLabel('social')).toBe('Social Media');
    expect(categoryLabel('ad-automation')).toBe('Ads');
  });
});
