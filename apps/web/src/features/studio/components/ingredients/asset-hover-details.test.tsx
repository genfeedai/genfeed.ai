import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AssetHoverDetails from './asset-hover-details';

describe('AssetHoverDetails', () => {
  it('reveals actions on touch and does not leave them clickable while hidden', () => {
    const { container } = render(
      <AssetHoverDetails
        actions={<span>Make clips</span>}
        metadata="12s"
        typeLabel="Video"
      />,
    );
    const details = container.querySelector('[data-asset-hover-details]');

    expect(details).toHaveClass(
      'opacity-100',
      '[@media(hover:hover)]:opacity-0',
      '[@media(hover:hover)]:pointer-events-none',
      '[@media(hover:hover)]:group-hover:pointer-events-auto',
      '[@media(hover:hover)]:group-focus-within:opacity-100',
    );
    expect(details).not.toHaveClass('opacity-0');
    expect(screen.getByText('Make clips').parentElement).not.toHaveClass(
      'pointer-events-auto',
    );
  });
});
