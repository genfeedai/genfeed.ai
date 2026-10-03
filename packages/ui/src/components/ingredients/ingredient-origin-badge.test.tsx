import { IngredientOrigin } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import IngredientOriginBadge from './ingredient-origin-badge';

describe('IngredientOriginBadge', () => {
  it.each([
    [IngredientOrigin.UPLOADED, 'Uploaded'],
    [IngredientOrigin.GENERATED, 'Generated'],
    [IngredientOrigin.IMPORTED, 'Imported'],
    [IngredientOrigin.UNKNOWN, 'Unknown'],
  ])('labels %s in words, not color alone', (origin, label) => {
    render(<IngredientOriginBadge origin={origin} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it.each([undefined, null])('renders nothing for %p', (origin) => {
    const { container } = render(<IngredientOriginBadge origin={origin} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('passes its class through to the badge', () => {
    render(
      <IngredientOriginBadge
        className="custom-position"
        origin={IngredientOrigin.UPLOADED}
      />,
    );

    expect(screen.getByText('Uploaded')).toHaveClass('custom-position');
  });
});
