import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

/**
 * The subbar's view trigger, named for the layout it currently shows. Specs
 * that stub `next-intl` to echo keys see `label` where the app says `View`.
 */
export function viewMenuTrigger(active?: string | RegExp) {
  const activeSource = active instanceof RegExp ? active.source : active;
  return screen.getByRole('button', {
    name:
      activeSource === undefined
        ? /^(View|label): /
        : new RegExp(`^(View|label): ${activeSource}$`),
  });
}

/** Opens the shared View menu and picks one layout. */
export async function selectView(
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp,
): Promise<void> {
  await user.click(viewMenuTrigger());
  await user.click(await screen.findByRole('menuitemradio', { name }));
}
