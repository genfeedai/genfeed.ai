import '@testing-library/jest-dom/vitest';
import { WorkflowLifecycle } from '@genfeedai/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowSummary } from '@/features/workflows/services/workflow-api';
import WorkflowLibraryPage from './WorkflowLibraryPage';

const mocks = vi.hoisted(() => ({
  clearSelection: vi.fn(),
  cloudSync: true as unknown,
  handleDelete: vi.fn(),
  handleDisableSelected: vi.fn(),
  handleDuplicate: vi.fn(),
  handleToggleSchedule: vi.fn(),
  toggleFavorite: vi.fn(),
  favoriteIds: [] as string[],
  favorites: [] as Array<{ id: string }>,
  mostUsed: [] as Array<{ id: string; executionCount: number }>,
  favoriteError: false,
  isDesktopShell: false,
  isLoading: false as boolean,
  isSystemWorkflow: false,
  selectedIds: new Set<string>(),
  toggleSelected: vi.fn(),
  workflows: [] as WorkflowSummary[],
}));

vi.mock('@genfeedai/config/deployment', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/config/deployment')>();
  return {
    ...actual,
    isDesktopClient: () => mocks.isDesktopShell,
  };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@ui/collection/CollectionItemActions', () => ({
  default: ({
    primary,
    overflow,
  }: {
    primary?: ReactNode;
    overflow: Array<{
      id: string;
      label: string;
      onSelect?: () => void;
      isDisabled?: boolean;
    }>;
  }) => (
    <div>
      {primary}
      {overflow.map((action) => (
        <button
          type="button"
          key={action.id}
          disabled={action.isDisabled}
          onClick={action.onSelect}
        >
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./useWorkflowLibraryHighlights', () => ({
  useWorkflowLibraryHighlights: () => ({
    favorites: {
      items: mocks.favorites,
      isLoading: false,
      hasError: mocks.favoriteError,
    },
    mostUsed: { items: mocks.mostUsed, isLoading: false, hasError: false },
    favoriteIds: mocks.favoriteIds,
    isSavingFavorite: false,
    toggleFavorite: mocks.toggleFavorite,
    updateWorkflow: vi.fn(),
    removeWorkflow: vi.fn(),
    reload: vi.fn(),
  }),
}));

// Spread the real module: a bare object drops every other enum, so any new
// import in the render tree (CredentialPlatform, etc.) fails module resolution.
vi.mock('@genfeedai/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/contracts')>();

  return {
    ...actual,
    ButtonVariant: {
      DEFAULT: 'default',
      OUTLINE: 'outline',
      SECONDARY: 'secondary',
      UNSTYLED: 'unstyled',
    },
  };
});

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    headerAction,
    label,
    'data-testid': testId,
  }: {
    'data-testid'?: string;
    children?: ReactNode;
    headerAction?: ReactNode;
    label?: ReactNode;
  }) => (
    <article data-testid={testId}>
      <h2>{label}</h2>
      {headerAction}
      {children}
    </article>
  ),
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
        <button type="button" aria-label="Page help">
          Help
        </button>
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

vi.mock('@genfeedai/contexts/ui/page-help-context', () => ({
  usePageHelp: () => ({ body: 'Workflow help', title: 'Workflows' }),
}));

vi.mock('@ui/primitives/searchbar', () => ({
  default: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} />
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
    label,
    ariaLabel,
    onClick,
  }: {
    ariaLabel?: string;
    asChild?: boolean;
    children?: ReactNode;
    label?: string;
    onClick?: () => void;
  }) =>
    asChild ? (
      children
    ) : (
      <button type="button" aria-label={ariaLabel} onClick={onClick}>
        {label ?? children}
      </button>
    ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@ui/primitives/checkbox', () => ({
  Checkbox: ({
    'aria-label': ariaLabel,
    checked,
    onCheckedChange,
  }: {
    'aria-label': string;
    checked?: boolean;
    onCheckedChange?: () => void;
  }) => (
    <button
      aria-checked={checked}
      aria-label={ariaLabel}
      role="checkbox"
      type="button"
      onClick={() => onCheckedChange?.()}
    />
  ),
}));

vi.mock('@ui/primitives/switch', () => ({
  Switch: ({
    'aria-label': ariaLabel,
    checked,
    onCheckedChange,
  }: {
    'aria-label': string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      aria-checked={checked}
      aria-label={ariaLabel}
      role="switch"
      type="button"
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children?: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/ui/client-formatted-date', () => ({
  ClientFormattedDate: ({ value }: { value: string }) => <span>{value}</span>,
}));

vi.mock('@/features/workflows/services/workflow-api', () => ({
  isCanonicalSystemWorkflow: () => mocks.isSystemWorkflow,
}));

vi.mock('@/features/workflows/utils/status-helpers', () => ({
  formatLifecycleLabel: (lifecycle: string) =>
    lifecycle.charAt(0).toUpperCase() + lifecycle.slice(1),
  getLifecycleBadgeClass: () => 'lifecycle-badge',
  isNonDefaultWorkflowLifecycle: (lifecycle: string) =>
    lifecycle === 'published' || lifecycle === 'archived',
}));

vi.mock('./EmptyWorkflowState', () => ({
  default: () => <div>Empty workflows</div>,
}));

vi.mock('./WorkflowCardDropdown', () => ({
  default: ({ onDuplicate }: { onDuplicate: () => void }) => (
    <button type="button" aria-label="Workflow actions" onClick={onDuplicate} />
  ),
}));

vi.mock('./WorkflowCardPreview', () => ({
  default: ({ name }: { name: string }) => <div>{name} preview</div>,
}));

vi.mock('./useWorkflowLibraryPage', () => ({
  useWorkflowLibraryPage: () => ({
    error: null,
    handleDelete: mocks.handleDelete,
    handleDisableSelected: mocks.handleDisableSelected,
    handleDuplicate: mocks.handleDuplicate,
    handleToggleSchedule: mocks.handleToggleSchedule,
    href: (path: string) => `/acme/brand${path}`,
    selectedIds: mocks.selectedIds,
    toggleSelected: mocks.toggleSelected,
    clearSelection: mocks.clearSelection,
    pagination: { limit: 15, page: 1, pages: 1, total: 1 },
    setPage: vi.fn(),
    isCapable: true,
    isConnected: true,
    isLoading: mocks.isLoading,
    loadWorkflows: vi.fn(),
    searchInput: '',
    setSearchInput: vi.fn(),
    workflows: mocks.workflows.map((workflow) => ({
      cloudSync: mocks.cloudSync,
      ...workflow,
    })),
  }),
}));

describe('WorkflowLibraryPage card semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.favoriteIds = [];
    mocks.favorites = [];
    mocks.mostUsed = [];
    mocks.favoriteError = false;
    mocks.isSystemWorkflow = false;
    mocks.isDesktopShell = false;
    mocks.cloudSync = true;
    mocks.selectedIds = new Set();
    mocks.isLoading = false;
    mocks.workflows = [
      {
        id: 'workflow-1',
        createdAt: '2026-07-01T00:00:00.000Z',
        isScheduleEnabled: true,
        lifecycle: WorkflowLifecycle.PUBLISHED,
        nodeCount: 0,
        label: 'Scheduled workflow',
        schedule: '0 9 * * 1',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    ];
  });

  it('keeps one toolbar with search on the left and help before new workflow', () => {
    render(<WorkflowLibraryPage />);

    expect(screen.getAllByTestId('section-topbar')).toHaveLength(1);
    const toolbar = screen.getByTestId('section-topbar');
    const search = screen.getByPlaceholderText('Search workflows...');
    const help = screen.getByRole('button', { name: 'Page help' });
    const newWorkflow = screen.getAllByRole('link', {
      name: 'New Workflow',
    })[0];

    expect(toolbar).toContainElement(search);
    expect(toolbar).toContainElement(help);
    expect(toolbar).toContainElement(newWorkflow);
    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      '/acme/brand/automation/workflows',
    );
    expect(screen.getByRole('link', { name: 'Templates' })).toHaveAttribute(
      'href',
      '/acme/brand/automation/workflows/templates',
    );
    expect(
      search.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      help.compareDocumentPosition(newWorkflow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it.each(['list', 'grid'])(
    'keeps navigation, selection and schedule commands separate in %s',
    (view) => {
      render(<WorkflowLibraryPage />);
      if (view === 'grid')
        fireEvent.click(screen.getByRole('radio', { name: 'Grid' }));
      const link = screen.getByRole('link', {
        name: 'Open Scheduled workflow',
      });
      const scheduleSwitch = screen.getByRole('switch', {
        name: 'Disable schedule for Scheduled workflow',
      });
      expect(link).toHaveAttribute(
        'href',
        '/acme/brand/automation/workflows/workflow-1',
      );
      expect(scheduleSwitch.closest('a')).toBeNull();
      fireEvent.click(scheduleSwitch);
      expect(mocks.handleToggleSchedule).toHaveBeenCalledWith(
        'workflow-1',
        false,
      );
      fireEvent.click(
        screen.getByRole('checkbox', { name: 'Select Scheduled workflow' }),
      );
      expect(mocks.toggleSelected).toHaveBeenCalledWith('workflow-1');
      fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
      expect(mocks.handleDuplicate).toHaveBeenCalledWith('workflow-1');
      fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
      expect(mocks.toggleFavorite).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'workflow-1' }),
      );
      expect(screen.queryByText('Scheduled workflow preview') !== null).toBe(
        view === 'grid',
      );
    },
  );

  it('defaults to rows and shows favorites, team usage, recent, then all', () => {
    const workflow = mocks.workflows[0];
    mocks.workflows = Array.from({ length: 7 }, (_, index) => ({
      ...workflow,
      id: `workflow-${index + 1}`,
      label: `Workflow ${index + 1}`,
      updatedAt: `2026-07-0${index + 1}T00:00:00.000Z`,
    }));
    mocks.favorites = [mocks.workflows[6]];
    mocks.favoriteIds = ['workflow-7'];
    mocks.mostUsed = [{ ...mocks.workflows[0], executionCount: 23 }];
    render(<WorkflowLibraryPage />);
    expect(screen.queryByTestId('workflow-library-card')).toBeNull();
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((node) => node.textContent)
        .filter(Boolean),
    ).toEqual([
      'Favorites',
      'Most used by your team',
      'Recent',
      'All workflows',
    ]);
    expect(
      within(screen.getByTestId('workflow-section-recent')).queryByText(
        'Workflow 7',
      ),
    ).toBeNull();
    expect(
      within(screen.getByTestId('workflow-section-most-used')).getByText(
        '23 runs',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('workflow-section-most-used')).queryByRole(
        'switch',
      ),
    ).toBeNull();
    expect(
      within(screen.getByTestId('workflow-section-favorites')).getByRole(
        'button',
        { name: 'Remove from favorites' },
      ),
    ).toBeInTheDocument();
  });

  it('keeps the library usable when Favorites fails', () => {
    mocks.favoriteError = true;
    render(<WorkflowLibraryPage />);
    expect(
      within(screen.getByTestId('workflow-section-favorites')).getByRole(
        'alert',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('workflow-section-all')).getByRole('link', {
        name: 'Open Scheduled workflow',
      }),
    ).toBeInTheDocument();
  });

  it('shows bulk commands for selected rows across views', () => {
    mocks.selectedIds = new Set(['workflow-1']);
    render(<WorkflowLibraryPage />);
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }));
    expect(screen.getByRole('checkbox')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Disable schedules' }));
    expect(mocks.handleDisableSelected).toHaveBeenCalledOnce();
  });

  it('uses semantic status tokens for cloud and system workflow badges', () => {
    mocks.isDesktopShell = true;
    const { unmount } = render(<WorkflowLibraryPage />);

    expect(screen.getByText('synced')).toHaveClass(
      'bg-success/10',
      'text-success',
    );

    unmount();
    mocks.isSystemWorkflow = true;
    render(<WorkflowLibraryPage />);

    expect(screen.getByText('System')).toHaveClass('bg-info/10', 'text-info');
  });

  it('labels unsynced desktop workflows as local', () => {
    mocks.isDesktopShell = true;
    mocks.cloudSync = null;
    render(<WorkflowLibraryPage />);

    expect(screen.getByText('local')).toHaveClass(
      'bg-muted',
      'text-muted-foreground',
    );
  });

  it('labels published lifecycle and keeps the pause switch off the cramped header', () => {
    render(<WorkflowLibraryPage />);

    expect(screen.getByText('Published')).toHaveClass('lifecycle-badge');
    expect(screen.queryByText('published')).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', {
        name: 'Disable schedule for Scheduled workflow',
      }),
    ).toBeVisible();
  });

  it('keeps search and creation in the sub-navbar while the initial load is pending', () => {
    mocks.isLoading = true;
    mocks.workflows = [];
    render(<WorkflowLibraryPage />);

    const topbar = screen.getByTestId('section-topbar');
    const search = screen.getByPlaceholderText('Search workflows...');
    const createLinks = screen.getAllByRole('link', { name: 'New Workflow' });

    expect(topbar).toContainElement(search);
    expect(createLinks.some((link) => topbar.contains(link))).toBe(true);
    expect(topbar).toContainElement(
      screen.getByRole('link', { name: 'Templates' }),
    );
    expect(screen.queryByText('Autopilot')).toBeNull();
    expect(screen.getByTestId('library-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('library-content')).not.toBeInTheDocument();
  });

  it('keeps create on the empty state instead of duplicating it in the toolbar', () => {
    mocks.isLoading = false;
    mocks.workflows = [];
    render(<WorkflowLibraryPage />);

    expect(
      screen.getByPlaceholderText('Search workflows...'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'New Workflow' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Empty workflows')).toBeInTheDocument();
  });
});
