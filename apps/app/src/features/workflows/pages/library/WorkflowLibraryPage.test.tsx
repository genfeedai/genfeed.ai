import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowLibraryPage from './WorkflowLibraryPage';

const mocks = vi.hoisted(() => ({
  clearSelection: vi.fn(),
  cloudSync: true as unknown,
  handleDelete: vi.fn(),
  handleDisableSelected: vi.fn(),
  handleDuplicate: vi.fn(),
  handleToggleSchedule: vi.fn(),
  isDesktopShell: false,
  isSystemWorkflow: false,
  selectedIds: new Set<string>(),
  toggleSelected: vi.fn(),
}));

vi.mock('@genfeedai/config/deployment', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/config/deployment')>();
  return {
    ...actual,
    isDesktopClient: () => mocks.isDesktopShell,
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      'actions.retry': 'Retry',
      'library.autopilot': 'Autopilot',
      'library.created': 'Created',
      'library.description':
        'Use workflows for fixed, reusable automation graphs and scheduled pipelines.',
      'library.info':
        'are explicit automation graphs. Schedule a workflow when the steps should be predictable and repeatable. For adaptive agent behavior, use',
      'library.infoSuffix': '.',
      'library.local': 'local',
      'library.newWorkflow': 'New Workflow',
      'library.nextRun': 'Next run',
      'library.paused': 'Paused',
      'library.platformManaged': 'Platform-managed',
      'library.clearSelection': 'Clear',
      'library.disableSelected': 'Disable schedules',
      'library.searchPlaceholder': 'Search workflows...',
      'library.selectWorkflow': 'Select workflow',
      'library.selectedCount': 'selected',
      'library.synced': 'synced',
      'library.system': 'System',
      'library.templates': 'Templates',
      'library.title': 'Workflows',
      'library.updated': 'Updated',
      'library.next': 'Next',
      'library.pageStatus': 'Page {page} of {pages}',
      'library.previous': 'Previous',
    };
    return messages[key] ?? key;
  },
}));

// Spread the real module: a bare object drops every other enum, so any new
// import in the render tree (CredentialPlatform, etc.) fails module resolution.
vi.mock('@genfeedai/enums', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/enums')>();

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
  }: {
    children?: ReactNode;
    headerAction?: ReactNode;
    label?: ReactNode;
  }) => (
    <article>
      <h2>{label}</h2>
      {headerAction}
      {children}
    </article>
  ),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    right,
  }: {
    children?: ReactNode;
    right?: ReactNode;
  }) => (
    <main>
      {right}
      {children}
    </main>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    asChild,
    children,
    label,
    onClick,
  }: {
    asChild?: boolean;
    children?: ReactNode;
    label?: string;
    onClick?: () => void;
  }) =>
    asChild ? (
      children
    ) : (
      <button type="button" onClick={onClick}>
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
    filteredWorkflows: [
      {
        id: 'workflow-1',
        cloudSync: mocks.cloudSync,
        createdAt: '2026-07-01T00:00:00.000Z',
        isScheduleEnabled: true,
        lifecycle: 'published',
        label: 'Scheduled workflow',
        schedule: '0 9 * * 1',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    ],
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
    isLoading: false,
    loadWorkflows: vi.fn(),
    searchInput: '',
    setSearchInput: vi.fn(),
    workflows: [{ id: 'workflow-1' }],
  }),
}));

describe('WorkflowLibraryPage card semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSystemWorkflow = false;
    mocks.isDesktopShell = false;
    mocks.cloudSync = true;
    mocks.selectedIds = new Set();
  });

  it('keeps card navigation separate from schedule and menu actions', () => {
    render(<WorkflowLibraryPage />);

    expect(
      screen.getByRole('link', { name: 'Templates' }).querySelector('button'),
    ).toBeNull();
    for (const link of screen.getAllByRole('link', {
      name: 'New Workflow',
    })) {
      expect(link.querySelector('button')).toBeNull();
    }

    const cardLink = screen.getByRole('link', {
      name: 'Open Scheduled workflow',
    });
    const scheduleSwitch = screen.getByRole('switch', {
      name: 'Disable schedule for Scheduled workflow',
    });
    const actions = screen.getByRole('button', { name: 'Workflow actions' });

    expect(cardLink).toHaveAttribute(
      'href',
      '/acme/brand/automation/workflows/workflow-1',
    );
    expect(cardLink).toHaveClass(
      'absolute',
      'inset-0',
      'z-10',
      'focus-visible:ring-2',
      'focus-visible:ring-ring',
    );
    expect(actions.parentElement).toHaveClass('relative', 'z-20');
    expect(scheduleSwitch.closest('a')).toBeNull();
    expect(actions.closest('a')).toBeNull();
    expect(cardLink.closest('article')).toBe(scheduleSwitch.closest('article'));
    expect(cardLink.closest('article')).toBe(actions.closest('article'));

    fireEvent.click(scheduleSwitch);
    expect(mocks.handleToggleSchedule).toHaveBeenCalledWith(
      'workflow-1',
      false,
    );

    fireEvent.click(actions);
    expect(mocks.handleDuplicate).toHaveBeenCalledWith('workflow-1');
  });

  it('does not label hosted SaaS workflows as local or synced', () => {
    mocks.cloudSync = null;
    render(<WorkflowLibraryPage />);

    expect(screen.queryByText('local')).not.toBeInTheDocument();
    expect(screen.queryByText('synced')).not.toBeInTheDocument();
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

  it('lets operators pause system workflow schedules', () => {
    mocks.isSystemWorkflow = true;
    render(<WorkflowLibraryPage />);

    expect(
      screen.getByRole('switch', {
        name: 'Disable schedule for Scheduled workflow',
      }),
    ).toBeVisible();
    expect(screen.queryByText('Platform-managed')).not.toBeInTheDocument();
  });
});
