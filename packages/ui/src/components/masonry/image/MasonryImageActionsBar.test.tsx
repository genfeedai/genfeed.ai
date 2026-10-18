import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IImage } from '@genfeedai/contracts/interfaces';
import type { MasonryActionStates } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { fireEvent, render, screen } from '@testing-library/react';
import MasonryImageActionsBar from '@ui/masonry/image/MasonryImageActionsBar';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  quickActions: vi.fn(),
}));

vi.mock('@ui/quick-actions/actions/IngredientQuickActions', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.quickActions(props);
    return <div data-testid="quick-actions" />;
  },
}));

const image = {
  category: IngredientCategory.IMAGE,
  id: 'image-1',
  status: IngredientStatus.GENERATED,
} as IImage;

describe('MasonryImageActionsBar', () => {
  it('keeps real shared actions without inventing a dead reprompt', () => {
    const handlers = {
      handleCopyPrompt: vi.fn(),
      handleMarkArchived: vi.fn(),
      handleMarkRejected: vi.fn(),
      handleMarkValidated: vi.fn(),
      handleReprompt: vi.fn(),
      handleShare: vi.fn(),
    } as unknown as Parameters<typeof MasonryImageActionsBar>[0]['handlers'];

    render(
      <MasonryImageActionsBar
        actionStates={{} as MasonryActionStates}
        handleDownload={vi.fn()}
        handleQuickActionsMouseEnter={vi.fn()}
        handleQuickActionsMouseLeave={vi.fn()}
        handlers={handlers}
        image={image}
        isActionsEnabled
        isSelected={false}
        showActions
      />,
    );

    const props = mocks.quickActions.mock.calls.at(-1)?.[0] as {
      onCopy: unknown;
      onMarkArchived: unknown;
      onMarkRejected: unknown;
      onMarkValidated: unknown;
      onReprompt: unknown;
      onShare: unknown;
    };
    expect(props).toMatchObject({
      onCopy: handlers.handleCopyPrompt,
      onMarkArchived: handlers.handleMarkArchived,
      onMarkRejected: handlers.handleMarkRejected,
      onMarkValidated: handlers.handleMarkValidated,
      onReprompt: undefined,
      onShare: handlers.handleShare,
    });
  });

  it('keeps actions mounted and visible without hover', () => {
    const { container } = render(
      <MasonryImageActionsBar
        actionStates={{} as MasonryActionStates}
        handleDownload={vi.fn()}
        handleQuickActionsMouseEnter={vi.fn()}
        handleQuickActionsMouseLeave={vi.fn()}
        handlers={
          {} as Parameters<typeof MasonryImageActionsBar>[0]['handlers']
        }
        image={image}
        isActionsEnabled
        isSelected={false}
        showActions={false}
      />,
    );

    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass(
      'opacity-100',
      'pointer-events-auto',
      '[@media(hover:hover)]:opacity-0',
      '[@media(hover:hover)]:pointer-events-none',
      '[@media(hover:hover)]:group-focus-within:opacity-100',
      '[@media(hover:hover)]:group-focus-within:pointer-events-auto',
    );
  });

  it('offers only Delete while the image is failed or still generating', () => {
    const handleDelete = vi.fn();
    mocks.quickActions.mockClear();

    render(
      <MasonryImageActionsBar
        actionStates={{} as MasonryActionStates}
        handleDownload={vi.fn()}
        handleQuickActionsMouseEnter={vi.fn()}
        handleQuickActionsMouseLeave={vi.fn()}
        handlers={
          { handleDelete } as unknown as Parameters<
            typeof MasonryImageActionsBar
          >[0]['handlers']
        }
        image={{ ...image, status: IngredientStatus.FAILED } as IImage}
        isActionsEnabled
        isSelected={false}
        isUnavailable
        showActions
      />,
    );

    expect(screen.queryByTestId('quick-actions')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }));
    expect(handleDelete).toHaveBeenCalledTimes(1);
  });
});
