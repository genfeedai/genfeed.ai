import '@testing-library/jest-dom/vitest';
import { translateFromCatalog } from '@app-tests/next-intl.stub';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowTemplate } from '@/features/workflows/services/workflow-api';
import WorkflowTemplatesPage, {
  cadenceLabel,
  categoryLabel,
} from './WorkflowTemplatesPage';

type Translator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  href: vi.fn((path: string) => `/demo/FUDNEWS${path}`),
  installSystemCatalog: vi.fn(),
  list: vi.fn(),
  listSystemCatalog: vi.fn(),
  listTemplates: vi.fn(),
  replace: vi.fn(),
  useTranslations: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => mocks.useTranslations(namespace),
}));

/**
 * Models a locale switch: the real catalog with some messages replaced, and a
 * new translator identity per namespace, as next-intl hands out on a change.
 */
function translateWithOverrides(overrides: Record<string, string>) {
  const translators = new Map<string, Translator>();
  return (namespace: string): Translator => {
    const cached = translators.get(namespace);
    if (cached) {
      return cached;
    }
    const base = translateFromCatalog(namespace);
    const translator: Translator = (key, values) =>
      overrides[`${namespace}.${key}`] ?? base(key, values);
    translators.set(namespace, translator);
    return translator;
  };
}

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

vi.mock('@ui/layout/horizontal-carousel/HorizontalCarousel', () => ({
  default: ({ children }: { children?: ReactNode }) => (
    <div data-testid="featured-carousel">{children}</div>
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

function featuredSection() {
  return screen.getByRole('region', { name: 'Featured' });
}

function digestRow() {
  const row = within(allSection())
    .getAllByTestId('workflow-template-row')
    .find((candidate) => within(candidate).queryByText('Daily digest'));
  if (!row) {
    throw new Error('Daily digest row not rendered');
  }
  return row;
}

/** Visible links and buttons, named the way assistive tech announces them. */
function visibleActions(container: HTMLElement) {
  return [
    ...within(container).queryAllByRole('link'),
    ...within(container).queryAllByRole('button'),
  ].map((element) => element.getAttribute('aria-label') ?? element.textContent);
}

async function renderLoadedPage() {
  const view = render(<WorkflowTemplatesPage />);
  await waitFor(() => {
    expect(within(allSection()).getByText('Social blast')).toBeInTheDocument();
    expect(within(allSection()).getByText('Daily digest')).toBeInTheDocument();
  });
  return view;
}

async function openOverflow(container: HTMLElement) {
  const user = userEvent.setup();
  const trigger = within(container).getByRole('button', {
    name: 'More actions',
  });
  trigger.focus();
  await user.keyboard('{Enter}');
  return { menu: await screen.findByRole('menu'), trigger, user };
}

describe('WorkflowTemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.useTranslations.mockImplementation(translateFromCatalog);
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

  // Example-output media is not in the catalog yet (#5498); Featured shows
  // each official template's workflow graph in the meantime.
  it('features official catalog templates with their workflow graph', async () => {
    await renderLoadedPage();

    const featured = featuredSection();
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
    render(<WorkflowTemplatesPage />);

    await waitFor(() => {
      expect(
        within(featuredSection()).getByText('Social blast'),
      ).toBeInTheDocument();
    });
  });

  it('hides Browse by type when the catalog has a single type', async () => {
    mocks.listSystemCatalog.mockResolvedValue([]);
    render(<WorkflowTemplatesPage />);
    await waitFor(() => {
      expect(
        within(allSection()).getByText('Social blast'),
      ).toBeInTheDocument();
    });

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

  it('filters All from a type tile, marks it pressed and shows a removable chip', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    const browse = screen.getByRole('region', { name: 'Browse by type' });
    const tiles = within(browse).getAllByTestId('workflow-template-type-tile');
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual([
      'Content',
      'Social Media',
    ]);
    for (const tile of tiles) {
      expect(tile).toHaveAttribute('aria-pressed', 'false');
    }

    await user.click(
      within(browse).getByRole('button', { name: 'Social Media' }),
    );

    const all = allSection();
    expect(within(all).getByText('Social blast')).toBeInTheDocument();
    expect(within(all).queryByText('Daily digest')).not.toBeInTheDocument();
    expect(
      within(browse).getByRole('button', { name: 'Social Media' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(browse).getByRole('button', { name: 'Content' }),
    ).toHaveAttribute('aria-pressed', 'false');

    await user.click(
      within(all).getByRole('button', { name: 'Remove filter Social Media' }),
    );

    expect(within(all).getByText('Daily digest')).toBeInTheDocument();
    expect(
      within(browse).getByRole('button', { name: 'Social Media' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(all).queryByRole('button', { name: 'Remove filter Social Media' }),
    ).not.toBeInTheDocument();
  });

  it('activates a type tile from the keyboard', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    const browse = screen.getByRole('region', { name: 'Browse by type' });
    const contentTile = within(browse).getByRole('button', { name: 'Content' });
    contentTile.focus();
    await user.keyboard('{Enter}');

    expect(contentTile).toHaveAttribute('aria-pressed', 'true');
    expect(within(allSection()).getByText('Daily digest')).toBeInTheDocument();
    expect(
      within(allSection()).queryByText('Social blast'),
    ).not.toBeInTheDocument();

    const socialTile = within(browse).getByRole('button', {
      name: 'Social Media',
    });
    socialTile.focus();
    await user.keyboard(' ');

    expect(socialTile).toHaveAttribute('aria-pressed', 'true');
    expect(contentTile).toHaveAttribute('aria-pressed', 'false');
    expect(within(allSection()).getByText('Social blast')).toBeInTheDocument();
  });

  it('shows Use template as the single visible action on every row and card', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    for (const row of within(allSection()).getAllByTestId(
      'workflow-template-row',
    )) {
      expect(visibleActions(row)).toEqual(['Use template', 'More actions']);
    }

    const featuredCards = within(featuredSection()).getAllByTestId(
      'workflow-template-card',
    );
    expect(featuredCards).toHaveLength(1);
    for (const card of featuredCards) {
      expect(visibleActions(card)).toEqual(['Use template', 'More actions']);
    }

    await user.click(within(allSection()).getByRole('radio', { name: 'Grid' }));

    const gridCards = within(allSection()).getAllByTestId(
      'workflow-template-card',
    );
    expect(gridCards).toHaveLength(2);
    for (const card of gridCards) {
      expect(visibleActions(card)).toEqual(['Use template', 'More actions']);
    }

    expect(
      screen.queryByRole('button', { name: 'Install' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View details' }),
    ).not.toBeInTheDocument();
  });

  it('renders the card description as passive text', async () => {
    await renderLoadedPage();

    const description = within(featuredSection()).getByText(
      'App-owned automation.',
    );
    expect(description.tagName).toBe('P');
    expect(description.closest('button')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'App-owned automation.' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the overflow closed until the keyboard opens it', async () => {
    await renderLoadedPage();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText('View details')).not.toBeInTheDocument();

    const { menu, trigger, user } = await openOverflow(digestRow());

    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['View details', 'Install']);

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it('opens a catalog template from Use template', async () => {
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(
      within(digestRow()).getByRole('button', { name: 'Use template' }),
    );

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        '/demo/FUDNEWS/automation/workflows/wf-installed',
      );
    });
    expect(mocks.installSystemCatalog).toHaveBeenCalledWith('system-1');
  });

  it('installs from the overflow without leaving the page', async () => {
    await renderLoadedPage();

    const row = digestRow();
    const { menu, user } = await openOverflow(row);
    await user.click(within(menu).getByRole('menuitem', { name: 'Install' }));

    await waitFor(() => {
      expect(mocks.installSystemCatalog).toHaveBeenCalledWith('system-1');
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        within(row).getByRole('link', { name: 'Use template' }),
      ).toHaveAttribute(
        'href',
        '/demo/FUDNEWS/automation/workflows/wf-installed',
      );
    });
  });

  it('keeps Install inert in the overflow while that template installs', async () => {
    let resolveInstall: (value: { id: string }) => void = () => {};
    mocks.installSystemCatalog.mockReturnValue(
      new Promise((resolve) => {
        resolveInstall = resolve;
      }),
    );
    const user = userEvent.setup();
    await renderLoadedPage();

    await user.click(
      within(digestRow()).getByRole('button', { name: 'Use template' }),
    );
    expect(
      within(digestRow()).getByRole('button', { name: 'Installing…' }),
    ).toBeDisabled();

    const { menu } = await openOverflow(digestRow());
    const installItem = within(menu).getByRole('menuitem', { name: 'Install' });
    expect(installItem).toHaveAttribute('aria-disabled', 'true');

    installItem.click();
    expect(mocks.installSystemCatalog).toHaveBeenCalledTimes(1);

    resolveInstall({ id: 'wf-installed' });
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith(
        '/demo/FUDNEWS/automation/workflows/wf-installed',
      );
    });
  });

  it('opens a details dialog from the overflow menu', async () => {
    await renderLoadedPage();

    const { menu, user } = await openOverflow(digestRow());
    await user.click(
      within(menu).getByRole('menuitem', { name: 'View details' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Daily digest' }),
    ).toBeVisible();
    expect(within(dialog).getByText('App-owned automation.')).toBeVisible();
  });

  it('keeps the official catalog when templates fail, with a scoped retry', async () => {
    const user = userEvent.setup();
    mocks.listTemplates.mockRejectedValueOnce(new Error('templates down'));
    render(<WorkflowTemplatesPage />);

    await waitFor(() => {
      expect(
        within(allSection()).getByText('Daily digest'),
      ).toBeInTheDocument();
    });
    expect(
      within(featuredSection()).getByText('Daily digest'),
    ).toBeInTheDocument();
    expect(within(featuredSection()).queryByRole('alert')).toBeNull();

    const alert = within(allSection()).getByRole('alert');
    expect(alert).toHaveTextContent('Starter templates could not be loaded.');
    expect(
      screen.queryByText('No workflow templates are available yet.'),
    ).not.toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        within(allSection()).getByText('Social blast'),
      ).toBeInTheDocument();
    });
    expect(within(allSection()).queryByRole('alert')).toBeNull();
    expect(mocks.listTemplates).toHaveBeenCalledTimes(2);
    expect(mocks.listSystemCatalog).toHaveBeenCalledTimes(1);
  });

  it('keeps templates when the official catalog fails, with a Featured retry', async () => {
    const user = userEvent.setup();
    mocks.listSystemCatalog.mockRejectedValueOnce(new Error('catalog down'));
    render(<WorkflowTemplatesPage />);

    await waitFor(() => {
      expect(
        within(allSection()).getByText('Social blast'),
      ).toBeInTheDocument();
    });

    const featuredAlert = within(featuredSection()).getByRole('alert');
    expect(featuredAlert).toHaveTextContent(
      'Official workflows could not be loaded.',
    );
    expect(
      within(featuredSection()).queryByText('Social blast'),
    ).not.toBeInTheDocument();
    expect(within(allSection()).getByRole('alert')).toHaveTextContent(
      'Official workflows could not be loaded.',
    );

    await user.click(
      within(featuredAlert).getByRole('button', { name: 'Retry' }),
    );

    await waitFor(() => {
      expect(
        within(featuredSection()).getByText('Daily digest'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(within(allSection()).getByText('Social blast')).toBeInTheDocument();
    expect(mocks.listSystemCatalog).toHaveBeenCalledTimes(2);
    expect(mocks.listTemplates).toHaveBeenCalledTimes(1);
  });

  it('shows section errors instead of an empty catalog when every request fails', async () => {
    const user = userEvent.setup();
    mocks.listTemplates.mockRejectedValueOnce(new Error('templates down'));
    mocks.listSystemCatalog.mockRejectedValueOnce(new Error('catalog down'));
    render(<WorkflowTemplatesPage />);

    const allAlert = await within(allSection()).findByRole('alert');
    expect(allAlert).toHaveTextContent('Templates could not be loaded.');
    expect(within(featuredSection()).getByRole('alert')).toHaveTextContent(
      'Official workflows could not be loaded.',
    );
    expect(
      screen.queryByText('No workflow templates are available yet.'),
    ).not.toBeInTheDocument();

    await user.click(within(allAlert).getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(
        within(allSection()).getByText('Social blast'),
      ).toBeInTheDocument();
      expect(
        within(allSection()).getByText('Daily digest'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('localizes category, chip and cadence labels and follows translation changes', async () => {
    const user = userEvent.setup();
    mocks.listTemplates.mockResolvedValue([
      { ...POST_HARD_CUT_TEMPLATE, schedule: '0 9 * * 1-5' },
    ]);
    const { rerender } = await renderLoadedPage();

    const socialRow = () =>
      within(allSection())
        .getAllByTestId('workflow-template-row')
        .find((row) => within(row).queryByText('Social blast')) as HTMLElement;
    expect(
      within(socialRow()).getByText(
        'Available · Social Media · Weekdays at 9:00 AM',
      ),
    ).toBeInTheDocument();

    mocks.useTranslations.mockImplementation(
      translateWithOverrides({
        'pages.workflows.templates.cadences.weekdaysMorning':
          'En semaine à 9 h',
        'pages.workflows.templates.categories.content': 'Contenu',
        'pages.workflows.templates.categories.social': 'Réseaux sociaux',
      }),
    );
    rerender(<WorkflowTemplatesPage />);

    const browse = screen.getByRole('region', { name: 'Browse by type' });
    expect(
      within(browse)
        .getAllByTestId('workflow-template-type-tile')
        .map((tile) => tile.getAttribute('aria-label')),
    ).toEqual(['Contenu', 'Réseaux sociaux']);
    expect(
      within(socialRow()).getByText(
        'Available · Réseaux sociaux · En semaine à 9 h',
      ),
    ).toBeInTheDocument();

    await user.click(
      within(browse).getByRole('button', { name: 'Réseaux sociaux' }),
    );
    expect(
      within(allSection()).getByRole('button', {
        name: 'Remove filter Réseaux sociaux',
      }),
    ).toBeInTheDocument();
  });

  it('resolves category and cadence labels through the catalog', () => {
    const translate = translateFromCatalog('pages.workflows.templates');

    expect(categoryLabel('social', translate)).toBe('Social Media');
    expect(categoryLabel('ad-automation', translate)).toBe('Ads');
    expect(categoryLabel('real-estate', translate)).toBe('Real Estate');
    expect(categoryLabel('all', translate)).toBe('All categories');
    expect(categoryLabel('ads', translate)).toBe('Ads');
    expect(categoryLabel('agents', translate)).toBe('Agents');
    expect(categoryLabel('analytics', translate)).toBe('Analytics');
    expect(categoryLabel('campaigns', translate)).toBe('Campaigns');

    expect(cadenceLabel('0 9 * * 1-5', translate)).toBe('Weekdays at 9:00 AM');
    expect(cadenceLabel(' 0 12 * * * ', translate)).toBe('Every day at noon');
    expect(cadenceLabel('*/15 * * * *', translate)).toBe('Scheduled');
    expect(cadenceLabel(undefined, translate)).toBeNull();
    expect(cadenceLabel('  ', translate)).toBeNull();
  });
});
