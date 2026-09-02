import { QualityTier } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import ModelSelectorQualityBar from '@ui/dropdowns/model-selector/ModelSelectorQualityBar';
import { describe, expect, it } from 'vitest';

describe('ModelSelectorQualityBar', () => {
  it('renders a 4-step meter for ultra quality', () => {
    render(<ModelSelectorQualityBar qualityTier={QualityTier.ULTRA} />);

    const meter = screen.getByRole('meter', { name: 'Quality' });
    expect(meter).toHaveAttribute('aria-valuenow', '4');
    expect(meter).toHaveAttribute('aria-valuetext', QualityTier.ULTRA);
  });

  it('fills one step for basic quality', () => {
    render(<ModelSelectorQualityBar qualityTier={QualityTier.BASIC} />);

    expect(screen.getByRole('meter', { name: 'Quality' })).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
  });

  it('renders nothing without a quality tier', () => {
    const { container } = render(<ModelSelectorQualityBar />);
    expect(container).toBeEmptyDOMElement();
  });
});
