import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IVideo } from '@genfeedai/contracts/interfaces';
import type { MasonryActionStates } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { render, screen } from '@testing-library/react';
import MasonryVideoActionsBar from '@ui/masonry/video/MasonryVideoActionsBar';
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

const video = {
  category: IngredientCategory.VIDEO,
  id: 'video-1',
  status: IngredientStatus.GENERATED,
} as IVideo;

function buildHandlers() {
  return {
    handleClone: vi.fn(),
    handleConvertToGif: vi.fn(),
    handleCopyPrompt: vi.fn(),
    handleDelete: vi.fn(),
    handleExtend: vi.fn(),
    handleLandscape: vi.fn(),
    handleMarkArchived: vi.fn(),
    handleMarkRejected: vi.fn(),
    handleMarkValidated: vi.fn(),
    handleMirror: vi.fn(),
    handlePortrait: vi.fn(),
    handlePublish: vi.fn(),
    handleReprompt: vi.fn(),
    handleReverse: vi.fn(),
    handleShare: vi.fn(),
    handleSquare: vi.fn(),
    handleUpscale: vi.fn(),
  };
}

describe('MasonryVideoActionsBar', () => {
  it('mounts keyboard-focusable actions before mouse hover', () => {
    const { container } = render(
      <MasonryVideoActionsBar
        actionStates={{} as MasonryActionStates}
        handleDownload={vi.fn()}
        handleQuickActionsMouseEnter={vi.fn()}
        handleQuickActionsMouseLeave={vi.fn()}
        handlers={buildHandlers()}
        isActionsEnabled
        isGeneratingCaptions={false}
        isHovered={false}
        isMirroring={false}
        isPortraiting={false}
        isReversing={false}
        isSelected={false}
        isUnavailable={false}
        video={video}
      />,
    );

    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass(
      'focus-within:opacity-100',
      'focus-within:pointer-events-auto',
    );
  });

  it('forwards the supported video caption action', () => {
    const handlers = buildHandlers();
    const handleGenerateCaptions = vi.fn();

    render(
      <MasonryVideoActionsBar
        actionStates={{} as MasonryActionStates}
        handleDownload={vi.fn()}
        handleQuickActionsMouseEnter={vi.fn()}
        handleQuickActionsMouseLeave={vi.fn()}
        handlers={handlers}
        isActionsEnabled
        isGeneratingCaptions={false}
        isHovered
        isMirroring={false}
        isPortraiting={false}
        isReversing={false}
        isSelected={false}
        isUnavailable={false}
        onGenerateCaptions={handleGenerateCaptions}
        video={video}
      />,
    );

    expect(mocks.quickActions.mock.calls.at(-1)?.[0]).toMatchObject({
      onGenerateCaptions: handleGenerateCaptions,
    });
  });
});
