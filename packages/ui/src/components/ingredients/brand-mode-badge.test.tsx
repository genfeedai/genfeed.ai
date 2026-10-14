import { render, screen } from '@testing-library/react';
import BrandModeBadge from '@ui/ingredients/brand-mode-badge';
import { describe, expect, it } from 'vitest';

describe('BrandModeBadge', () => {
  it.each([
    ['approved_brand', 'Approved brand'],
    ['provisional_brand', 'Provisional brand'],
    ['raw', 'Not branded'],
  ] as const)('labels %s in words, not color alone', (brandMode, label) => {
    render(<BrandModeBadge brandMode={brandMode} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders nothing when no brand mode was recorded', () => {
    const { container } = render(<BrandModeBadge />);

    expect(container).toBeEmptyDOMElement();
  });

  it('passes its class through to the badge', () => {
    render(<BrandModeBadge brandMode="raw" className="custom-position" />);

    expect(screen.getByText('Not branded')).toHaveClass('custom-position');
  });
});
