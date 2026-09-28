import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowTemplate } from '@/features/workflows/services/workflow-api';
import WorkflowTemplatesPage, { categoryLabel } from './WorkflowTemplatesPage';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  href: vi.fn((path: string) => `/demo/FUDNEWS${path}`),
  installSystemCatalog: vi.fn(),
  list: vi.fn(),
  listSystemCatalog: vi.fn(),
  listTemplates: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

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
    className,
    'data-testid': dataTestId,
    description,
    label,
    onClick,
    onDescriptionClick,
  }: {
    children?: ReactNode;
    className?: string;
    'data-testid'?: string;
    description?: string;
    label?: ReactNode;
    onClick?: () => void;
    onDescriptionClick?: () => void;
  }) =>
    onClick ? (
      <button
        type="button"
        aria-label={typeof label === 'string' ? label : undefined}
        className={className}
        data-testid={dataTestId}
        onClick={onClick}
      >
        {label}
        {children}
      </button>
    ) : (
      <article className={className} data-testid={dataTestId}>
        <h3>{label}</h3>
        {description ? (
          <button type="button" onClick={onDescriptionClick}>
            {description}
          </button>
        ) : null}
        {children}
      </article>
    ),
}));

vi.mock('@ui/layout/horizontal-carousel/HorizontalCarousel', () => ({
  default: ({ children }: { children?: ReactNode }) => (
    <div data-testid="featured-carousel">{children}</div>
  ),
}));

vi.mock('@ui/primitives/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => (
    <div data-testid="overflow-menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <div
      aria-disabled={disabled || undefined}
      data-testid="overflow-item"
      onClick={onSelect}
      onKeyDown={onSelect}
      role="menuitem"
      tabIndex={-1}
    >
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <div data-testid="overflow-separator" />,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@ui/primitives/dialog', () => ({
  Dialog: ({ children, open }: { children?: ReactNode; open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
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

const DAILY_DIGEST_ENTRY = {
  canonicalId: 'system-1',
  nodes: POST_HARD_CUT_TEMPLATE.nodes,
  edges: POST_HARD_CUT_TEMPLATE.edges,
  description: 'App-owned automation.',
  family: 'content',
  icon: '',
  installable: true,
  installed: false,
  label: 'Daily digest',
};

const VIEW_STORAGE_KEY = 'genfeed:collection-view:automation.templates';

function allSection() {
  return screen.getByRole('region', { name: 'All templates' });
}

async function renderLoadedPage() {
  render(<WorkflowTemplatesPage />);
  await waitFor(() => {
    expect(within(allSection()).getByText('Social blast')).toBeInTheDocument();
  });
}

describe('WorkflowTemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.listTemplates.mockResolvedValue([POST_HARD_CUT_TEMPLATE]);
    mocks.list.mockResolvedValue([]);
    mocks.listSystemCatalog.mockResolvedValue([DAILY_DIGEST_ENTRY]);
    mocks.installSystemCatalog.mockResolvedValue({ id: 'wf-installed' });
    mocks.getService.mockResolvedValue({
      create: vi.fn(),
      installSystemCatalog: mocks.installSystemCatalog,
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
    expect(
      screen.queryByRole('region', { name: 'Featured' }),
    ).not.toBeInTheDocument();

    resolveTemplates([]);
    await waitFor(() => {
      expect(screen.getByTestId('templates-content')).toBeInTheDocument();
    });
  });

  it('renders Featured, Browse by type and All in order', async () => {
    await renderLoadedPage();

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual(['Featured', 'Browse by type', 'All templates']);
  });

  it('features official catalog templates with an output preview', async () => {
    await renderLoadedPage();

    const featured = screen.getByRole('region', { name: 'Featured' });
    expect(within(featured).getByText('Daily digest')).toBeInTheDocument();
    expect(
      within(featured).queryByText('Social blast'),
    ).not.toBeInTheDocument();
    expect(
      within(featured).getByRole('img', {
        name: 'Daily digest workflow diagram',
      }),
    ).toBeInTheDocument();
  });

  it('falls back to the head of the catalog when no official templates exist', async () => {
    mocks.listSystemCatalog.mockResolvedValue([]);
    await renderLoadedPage();

    const featured = screen.getByRole('region', { name: 'Featured' });
    expect(within(featured).getByText('Social blast')).toBeInTheDocument();
  });

  it('hides Browse by type when the catalog has a single type', async () => {
    mocks.listSystemCatalog.mockResolvedValue([]);
    await renderLoadedPage();

    expect(
      screen.queryByRole('region', { name: 'Browse by type' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Browse by type' }),
    ).not.toBeInTheDocument();
  });

  it('renders no sections and one empty state for an empty catalog', async () => {
    mocks.listTemplates.mockResolvedValue([]);
    mocks.listSystemCatalog.mockResolvedValue([]);
    render(<WorkflowTemplatesPage />);

    expect(
      await screen.findByText('No workflow templates are available yet.'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
  });

  it('renders catalog and templates without mixing in the saved library', async () => {
    await renderLoadedPage();

    const all = allSection();
    expect(within(all).getByText('Daily digest')).toBeInTheDocument();
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
      within(all).getByRole('link', { name: 'Use template' }),
    ).toHaveAttribute(
      'href',
      '/demo/FUDNEWS/automation/workflows/templates?template=tpl-1',
    );
    expect(screen.queryByText('1 steps')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('section-topbar')).toHaveLength(1);
  });

  it('defaults All to a list and persists the grid toggle', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    const all = allSection();
    expect(within(all).getAllByTestId('workflow-template-row')).toHaveLength(2);
    expect(
      within(all).queryByTestId('workflow-template-card'),
    ).not.toBeInTheDocument();
    expect(within(all).getByRole('radio', { name: 'List' })).toBeChecked();

    await user.click(within(all).getByRole('radio', { name: 'Grid' }));

    expect(within(all).getAllByTestId('workflow-template-card')).toHaveLength(
      2,
    );
    expect(
      within(all).queryByTestId('workflow-template-row'),
    ).not.toBeInTheDocument();
    expect(
      within(all).getByRole('img', { name: 'Social blast workflow diagram' }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBe('grid');
    const allGrid = within(all).getByTestId('templates-all-collection')
      .firstElementChild as HTMLElement;
    expect(allGrid).toHaveClass('@[60rem]:grid-cols-3');
    expect(allGrid).not.toHaveClass('@[80rem]:grid-cols-4');
    expect(
      document.querySelector(
        '[class*="md:grid-cols"], [class*="xl:grid-cols"], [class*="gap-6"]',
      ),
    ).toBeNull();
  });

  it('filters All from a type tile and shows a removable chip', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    const browse = screen.getByRole('region', { name: 'Browse by type' });
    expect(
      within(browse)
        .getAllByTestId('workflow-template-type-tile')
        .map((tile) => tile.getAttribute('aria-label')),
    ).toEqual(['Content', 'Social Media']);

    await user.click(
      within(browse).getByRole('button', { name: 'Social Media' }),
    );

    const all = allSection();
    expect(within(all).getByText('Social blast')).toBeInTheDocument();
    expect(within(all).queryByText('Daily digest')).not.toBeInTheDocument();
    expect(
      within(browse).getByRole('button', { name: 'Social Media' }),
    ).toHaveClass('shadow-border-strong');

    await user.click(
      within(all).getByRole('button', { name: 'Remove filter Social Media' }),
    );

    expect(within(all).getByText('Daily digest')).toBeInTheDocument();
    expect(
      within(all).queryByRole('button', { name: 'Remove filter Social Media' }),
    ).not.toBeInTheDocument();
  });

  it('shows Use template as the single visible action per template', async () => {
    await renderLoadedPage();

    for (const row of within(allSection()).getAllByTestId(
      'workflow-template-row',
    )) {
      const visibleActions = [
        ...within(row).queryAllByRole('link'),
        ...within(row).queryAllByRole('button'),
      ].map(
        (element) => element.getAttribute('aria-label') ?? element.textContent,
      );
      expect(visibleActions).toEqual(['Use template', 'More actions']);
    }

    expect(
      screen.queryByRole('button', { name: 'Install' }),
    ).not.toBeInTheDocument();

    const digestRow = within(allSection())
      .getAllByTestId('workflow-template-row')
      .find((row) => within(row).queryByText('Daily digest'));
    expect(digestRow).toBeDefined();
    expect(
      within(digestRow as HTMLElement)
        .getAllByTestId('overflow-item')
        .map((item) => item.textContent),
    ).toEqual(['View details', 'Install']);
  });

  it('opens a catalog template from Use template', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    const digestRow = within(allSection())
      .getAllByTestId('workflow-template-row')
      .find((row) => within(row).queryByText('Daily digest')) as HTMLElement;

    await user.click(
      within(digestRow).getByRole('button', { name: 'Use template' }),
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        '/demo/FUDNEWS/automation/workflows/wf-installed',
      );
    });
    expect(mocks.installSystemCatalog).toHaveBeenCalledWith('system-1');
  });

  it('installs from the overflow without leaving the page', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    const digestRow = within(allSection())
      .getAllByTestId('workflow-template-row')
      .find((row) => within(row).queryByText('Daily digest')) as HTMLElement;
    const installItem = within(digestRow)
      .getAllByTestId('overflow-item')
      .find((item) => item.textContent === 'Install') as HTMLElement;

    await user.click(installItem);

    await waitFor(() => {
      expect(mocks.installSystemCatalog).toHaveBeenCalledWith('system-1');
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        within(digestRow).getByRole('link', { name: 'Use template' }),
      ).toHaveAttribute(
        'href',
        '/demo/FUDNEWS/automation/workflows/wf-installed',
      );
    });
  });

  it('opens a details dialog from the overflow menu', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    const digestRow = within(allSection())
      .getAllByTestId('workflow-template-row')
      .find((row) => within(row).queryByText('Daily digest')) as HTMLElement;
    const detailsItem = within(digestRow)
      .getAllByTestId('overflow-item')
      .find((item) => item.textContent === 'View details') as HTMLElement;

    await user.click(detailsItem);

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Daily digest' }),
    ).toBeVisible();
    expect(within(dialog).getByText('App-owned automation.')).toBeVisible();
  });

  it('opens a details dialog from the clamped card description', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(
      within(screen.getByRole('region', { name: 'Featured' })).getByRole(
        'button',
        { name: 'App-owned automation.' },
      ),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Daily digest' }),
    ).toBeVisible();
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
