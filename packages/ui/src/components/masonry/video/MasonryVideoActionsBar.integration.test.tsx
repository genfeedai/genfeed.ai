import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IVideo } from '@genfeedai/contracts/interfaces';
import type { MasonryActionStates } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MasonryVideoActionsBar from '@ui/masonry/video/MasonryVideoActionsBar';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org/brand${path}` }),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ settings: null }),
}));
vi.mock('@hooks/ui/use-storyboard-entry/use-storyboard-entry', () => ({
  useStoryboardEntry: () => ({
    canCreateFromAsset: () => false,
    createFromAsset: vi.fn(),
    isCreating: false,
  }),
}));
vi.mock('@ui/quick-actions/actions/IngredientDownloadButton', () => ({
  default: () => null,
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

type VideoActionsBarProps = Parameters<typeof MasonryVideoActionsBar>[0];

function renderFirstVideoCard() {
  const onSelect = vi.fn();
  const handlePublish = vi.fn();
  const video = {
    id: 'first-video',
    category: IngredientCategory.VIDEO,
    status: IngredientStatus.GENERATED,
  } as IVideo;
  render(
    <div role="presentation" onClick={onSelect}>
      <MasonryVideoActionsBar
        video={video}
        actionStates={{} as MasonryActionStates}
        handlers={
          { handlePublish } as Partial<
            VideoActionsBarProps['handlers']
          > as VideoActionsBarProps['handlers']
        }
        handleDownload={vi.fn()}
        handleQuickActionsMouseEnter={vi.fn()}
        handleQuickActionsMouseLeave={vi.fn()}
        isActionsEnabled
        isGeneratingCaptions={false}
        isHovered
        isMirroring={false}
        isPortraiting={false}
        isReversing={false}
        isSelected={false}
        isUnavailable={false}
      />
    </div>,
  );
  return { handlePublish, onSelect, video };
}

// Mirrors the image fixture: keep the real IngredientQuickActions, Radix menu
// and portal so the overflow control's event and focus boundary with its card
// is exercised, not a mocked stand-in.
describe('first masonry video card overflow integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['click', 'Enter', 'Space'])(
    'opens More with %s and Escape returns focus without selecting the card',
    async (activation) => {
      const user = userEvent.setup();
      const { onSelect } = renderFirstVideoCard();
      const trigger = screen.getByRole('button', { name: 'More' });
      if (activation === 'click') await user.click(trigger);
      else {
        trigger.focus();
        await user.keyboard(activation === 'Space' ? ' ' : '{Enter}');
      }
      expect(await screen.findByRole('menu')).toBeVisible();
      expect(onSelect).not.toHaveBeenCalled();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
      expect(trigger).toHaveFocus();
      expect(onSelect).not.toHaveBeenCalled();
    },
  );

  it('activates an action once through the portal without selecting its card', async () => {
    const user = userEvent.setup();
    const { handlePublish, onSelect, video } = renderFirstVideoCard();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Publish' }));
    expect(handlePublish).toHaveBeenCalledTimes(1);
    expect(handlePublish.mock.calls[0]?.[0]).toBe(video);
    expect(onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});
