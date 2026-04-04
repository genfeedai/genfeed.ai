import { describe, expect, it } from 'vitest';
import {
  STUDIO_LOGO_HREF,
  STUDIO_MENU_ITEMS,
} from './studio-menu-items.config';

describe('STUDIO_MENU_ITEMS', () => {
  it('keeps batch visually separated from generation modes', () => {
    const batchItem = STUDIO_MENU_ITEMS.find(
      (item) => item.href === '/studio/batch',
    );

    expect(batchItem).toMatchObject({
      hasDividerAbove: true,
      label: 'Batch',
    });
  });

  it('keeps the studio logo href pointed at the library workspace', () => {
    expect(STUDIO_LOGO_HREF).toBe('/library/ingredients');
  });
});
