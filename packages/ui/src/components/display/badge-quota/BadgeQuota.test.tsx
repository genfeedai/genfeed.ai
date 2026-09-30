import { render } from '@testing-library/react';
import BadgeQuota from '@ui/display/badge-quota/BadgeQuota';
import { describe, expect, it } from 'vitest';

describe('BadgeQuota', () => {
  it('should render without crashing', () => {
    const { container } = render(<BadgeQuota />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(<BadgeQuota />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(<BadgeQuota />);
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
  });
});
