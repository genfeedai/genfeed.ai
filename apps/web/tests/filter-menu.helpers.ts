import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

/**
 * Picks one option of one facet in the shared Filters menu: open the menu,
 * open the facet's submenu, click the option. Names are matched as prefixes so
 * the right-aligned summary and counts do not break the lookup.
 */
export async function selectFilterOption(
  user: ReturnType<typeof userEvent.setup>,
  facet: string | RegExp,
  option: string | RegExp,
  {
    kind = 'radio',
    menu = /^Filters/,
  }: { kind?: 'checkbox' | 'radio'; menu?: string | RegExp } = {},
): Promise<void> {
  await user.click(screen.getByRole('button', { name: menu }));
  const facetItem = await screen.findByRole('menuitem', {
    name: typeof facet === 'string' ? new RegExp(`^${facet}`) : facet,
  });
  facetItem.focus();
  await user.keyboard('{ArrowRight}');
  await user.click(
    await screen.findByRole(`menuitem${kind}`, {
      name: typeof option === 'string' ? new RegExp(`^${option}`) : option,
    }),
  );
}
