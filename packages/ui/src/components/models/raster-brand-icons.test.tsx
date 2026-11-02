import { getModelBrandIcon } from '@genfeedai/helpers/ui/icons/model-brand-icon';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// The raster logos load on demand. The box the caller sized must hold from the
// first paint, and the artwork must arrive in it.
describe('raster model brand icons', () => {
  it.each(['argil', 'crun', 'heygen', 'leonardo', 'wan'])(
    'draws the %s artwork in the sized box',
    async (iconKey) => {
      const Icon = getModelBrandIcon(iconKey);
      if (!Icon) throw new Error(`no icon for ${iconKey}`);

      const { container } = render(<Icon className="size-4" />);

      expect(container.querySelector('svg')).toHaveClass('size-4');
      await waitFor(() =>
        expect(
          container.querySelector('svg image')?.getAttribute('href'),
        ).toMatch(/^(data:image\/png;base64,|#)/),
      );
      expect(container.querySelector('svg')).toHaveClass('size-4');
    },
  );
});
