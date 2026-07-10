import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WorkflowLibraryPage from './WorkflowLibraryPage';

const mocks = vi.hoisted(() => ({
  handleDelete: vi.fn(),
  handleDuplicate: vi.fn(),
  handleToggleSchedule: vi.fn(),
  isSystemWorkflow: false,
}));

vi.mock('@genfeedai/enums', () => ({
  ButtonVariant: {
    DEFAULT: 'default',
    OUTLINE: 'outline',
    SECONDARY: 'secondary',
    UNSTYLED: 'unstyled',
  },
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
  getLifecycleBadgeClass: () => 'lifecycle-badge',
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
        _id: 'workflow-1',
        cloudSync: true,
        createdAt: '2026-07-01T00:00:00.000Z',
        isScheduleEnabled: true,
        lifecycle: 'published',
        name: 'Scheduled workflow',
        schedule: '0 9 * * 1',
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
    ],
    handleDelete: mocks.handleDelete,
    handleDuplicate: mocks.handleDuplicate,
    handleToggleSchedule: mocks.handleToggleSchedule,
    href: (path: string) => `/acme/brand${path}`,
    isCapable: true,
    isConnected: true,
    isLoading: false,
    loadWorkflows: vi.fn(),
    searchInput: '',
    setSearchInput: vi.fn(),
    workflows: [{ _id: 'workflow-1' }],
  }),
}));

describe('WorkflowLibraryPage card semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSystemWorkflow = false;
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
      '/acme/brand/workflows/workflow-1',
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

  it('uses semantic status tokens for cloud and system workflow badges', () => {
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
});
