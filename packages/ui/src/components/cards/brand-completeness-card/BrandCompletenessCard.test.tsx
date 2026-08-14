import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import BrandCompletenessCard from './BrandCompletenessCard';

vi.mock('@genfeedai/hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));

describe('BrandCompletenessCard', () => {
  it('paints progress fills with foreground so they read on a dark canvas', () => {
    render(<BrandCompletenessCard brand={{ id: 'brand-1', label: 'Acme' }} />);

    const card = screen.getByTestId('brand-completeness-card');
    const fills = card.querySelectorAll('.bg-foreground');

    expect(fills.length).toBeGreaterThanOrEqual(2);
    expect(card.querySelector('.bg-primary')).toBeNull();
  });
});
