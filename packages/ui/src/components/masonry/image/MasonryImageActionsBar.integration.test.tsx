import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IImage } from '@genfeedai/contracts/interfaces';
import type { MasonryActionStates } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MasonryImageActionsBar from '@ui/masonry/image/MasonryImageActionsBar';
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

function renderFirstCard() {
  const onSelect = vi.fn();
  const image = {
    id: 'first-image',
    category: IngredientCategory.IMAGE,
    status: IngredientStatus.GENERATED,
  } as IImage;
  render(
    <div role="presentation" onClick={onSelect}>
      <MasonryImageActionsBar
        image={image}
        actionStates={{} as MasonryActionStates}
        handlers={
          {} as Parameters<typeof MasonryImageActionsBar>[0]['handlers']
        }
        handleDownload={vi.fn()}
        handleQuickActionsMouseEnter={vi.fn()}
        handleQuickActionsMouseLeave={vi.fn()}
        isActionsEnabled
        isSelected={false}
        showActions
      />
    </div>,
  );
  return { onSelect };
}

// Keep the actual action builder, IngredientQuickActions, Radix menu and its
// portal in this fixture: mocking the overflow control misses its event and
// focus boundary with the first gallery card.
describe('first masonry card overflow integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['click', 'Enter', 'Space'])(
    'opens More with %s and Escape returns focus without selecting the card',
    async (activation) => {
      const user = userEvent.setup();
      const { onSelect } = renderFirstCard();
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
    const { onSelect } = renderFirstCard();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(
      await screen.findByRole('menuitem', { name: /edit image/i }),
    );
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(
      '/org/brand/studio/playground?editImage=first-image',
    );
    expect(onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});
