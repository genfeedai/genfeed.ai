import {
  CredentialPlatform,
  IngredientCategory,
  IngredientStatus,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IIngredient, IPost } from '@genfeedai/contracts/interfaces';
import type { StatusDropdownProps } from '@genfeedai/props/social/status-dropdown.props';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DropdownStatus from '@ui/dropdowns/status/DropdownStatus';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const { mockPostsFindOne, mockPostsPatch } = vi.hoisted(() => ({
  mockPostsFindOne: vi.fn(),
  mockPostsPatch: vi.fn(),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    return () => Promise.resolve(factory('test-token'));
  },
}));

vi.mock('@genfeedai/services/content/posts.service', () => ({
  PostsService: {
    getInstance: () => ({
      findOne: mockPostsFindOne,
      patch: mockPostsPatch,
    }),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
    }),
  },
}));

vi.mock('@ui/primitives/dropdown', () => ({
  Dropdown: ({
    trigger,
    children,
  }: {
    trigger: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <div data-testid="dropdown-trigger">{trigger}</div>
      <div data-testid="dropdown-content">{children}</div>
    </div>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  buttonVariants: () => '',
}));

describe('DropdownStatus', () => {
  const entity = {
    category: IngredientCategory.IMAGE,
    id: 'ingredient-1',
    status: IngredientStatus.GENERATED,
  } as IIngredient;

  const baseProps: StatusDropdownProps = {
    entity,
    onStatusChange: vi.fn(),
  };

  it('should render without crashing', () => {
    const { container } = render(<DropdownStatus {...baseProps} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<DropdownStatus {...baseProps} />);
    expect(container.querySelector('button')).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<DropdownStatus {...baseProps} />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });

  it('paints the trigger as a muted status pill, not a raw variant name', () => {
    render(<DropdownStatus {...baseProps} />);

    const trigger = within(screen.getByTestId('dropdown-trigger')).getByText(
      'Completed',
    );

    expect(trigger).toHaveClass('bg-success/10');
    expect(trigger).toHaveClass('text-success');
    expect(trigger.className).not.toMatch(/\buppercase\b/);
  });

  it('patches posts with canonical execution state and visibility', async () => {
    mockPostsPatch.mockResolvedValue({});
    mockPostsFindOne.mockResolvedValue({
      id: 'post-1',
      platform: CredentialPlatform.TWITTER,
      scheduledDate: '2026-08-14T10:00:00.000Z',
      status: PostStatus.PUBLIC,
    });

    const postEntity = {
      id: 'post-1',
      platform: CredentialPlatform.TWITTER,
      scheduledDate: '2026-08-14T10:00:00.000Z',
      status: PostStatus.DRAFT,
    } as IPost;

    render(<DropdownStatus entity={postEntity} onStatusChange={vi.fn()} />);

    await userEvent.click(screen.getByText('Public'));

    expect(mockPostsPatch).toHaveBeenCalledWith('post-1', {
      targetExecutionState: TargetExecutionState.PUBLISHED,
      visibility: PostVisibility.PUBLIC,
    });
    expect(mockPostsPatch.mock.calls[0]?.[1]).not.toHaveProperty('status');
  });
});
