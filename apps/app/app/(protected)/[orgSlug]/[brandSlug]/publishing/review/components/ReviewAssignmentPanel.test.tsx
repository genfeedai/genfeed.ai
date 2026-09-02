import { BatchItemStatus, ContentFormat } from '@genfeedai/contracts';
import type { IBatchItem } from '@genfeedai/contracts/interfaces';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findAllPages: vi.fn(),
  getMembersService: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getMembersService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
    value?: string;
  }) => (
    <div data-testid="assignee-select" data-value={value ?? ''}>
      {children}
      <button type="button" onClick={() => onValueChange('user-1')}>
        Choose user-1
      </button>
    </div>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <div>{placeholder}</div>
  ),
}));

import ReviewAssignmentPanel from './ReviewAssignmentPanel';

const baseItem: IBatchItem = {
  batchId: 'batch-1',
  createdAt: '2026-08-19T10:00:00.000Z',
  format: ContentFormat.IMAGE,
  id: 'item-1',
  status: BatchItemStatus.COMPLETED,
};

describe('ReviewAssignmentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAllPages.mockResolvedValue([
      {
        isActive: true,
        isDeleted: false,
        user: { handle: 'jane' },
        userFullName: 'Jane Doe',
        userId: 'user-1',
      },
      {
        isActive: true,
        isDeleted: false,
        user: { email: 'secret@example.com', handle: 'sam' },
        userEmail: 'secret@example.com',
        userFullName: 'Sam Lee',
        userId: 'user-2',
      },
      {
        isActive: false,
        isDeleted: false,
        user: { handle: 'inactive' },
        userFullName: 'Inactive Member',
        userId: 'user-inactive',
      },
    ]);
    mocks.getMembersService.mockResolvedValue({
      findAllPages: mocks.findAllPages,
    });
  });

  it('shows Unassigned and lists teammates by name/handle only', async () => {
    render(
      <ReviewAssignmentPanel
        isActioning={false}
        item={baseItem}
        onAssign={vi.fn()}
        onUnassign={vi.fn()}
      />,
    );

    expect(screen.getByText('Unassigned')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Jane Doe (@jane)')).toBeInTheDocument();
      expect(screen.getByText('Sam Lee (@sam)')).toBeInTheDocument();
    });

    expect(screen.queryByText('secret@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('Inactive Member')).not.toBeInTheDocument();
  });

  it('assigns the selected teammate and unassigns without touching decision UI', async () => {
    const onAssign = vi.fn();
    const onUnassign = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <ReviewAssignmentPanel
        isActioning={false}
        item={baseItem}
        onAssign={onAssign}
        onUnassign={onUnassign}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Jane Doe (@jane)').length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole('button', { name: 'Choose user-1' }));
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    expect(onAssign).toHaveBeenCalledWith('item-1', 'user-1');

    rerender(
      <ReviewAssignmentPanel
        isActioning={false}
        item={{
          ...baseItem,
          assignee: {
            displayName: 'Jane Doe',
            handle: 'jane',
            id: 'user-1',
          },
          assigneeId: 'user-1',
        }}
        onAssign={onAssign}
        onUnassign={onUnassign}
      />,
    );

    expect(screen.getAllByText('Jane Doe (@jane)').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Unassign' }));
    expect(onUnassign).toHaveBeenCalledWith('item-1');
  });

  it('lets the operator unassign an unavailable former member', async () => {
    const onUnassign = vi.fn();
    const user = userEvent.setup();

    render(
      <ReviewAssignmentPanel
        isActioning={false}
        item={{
          ...baseItem,
          assigneeId: 'user-gone',
        }}
        onAssign={vi.fn()}
        onUnassign={onUnassign}
      />,
    );

    expect(screen.getByText('Unavailable member')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unassign' }));
    expect(onUnassign).toHaveBeenCalledWith('item-1');
  });
});
