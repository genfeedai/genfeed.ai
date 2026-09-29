import { render, screen } from '@testing-library/react';
import { SectionLabel } from '@ui/typography/section-label';
import { describe, expect, it } from 'vitest';

describe('SectionLabel', () => {
  it('preserves default styles with custom className', () => {
    render(<SectionLabel className="custom-label">Label</SectionLabel>);
    const label = screen.getByText('Label');
    expect(label).toHaveClass('custom-label');
    expect(label).toHaveClass('uppercase');
    expect(label).toHaveClass('tracking-widest');
    expect(label).toHaveClass('font-black');
  });

  describe('styling', () => {
    it('uses the muted foreground role in both themes', () => {
      render(<SectionLabel>Label</SectionLabel>);
      expect(screen.getByText('Label')).toHaveClass('text-muted-foreground');
      expect(screen.getByText('Label')).not.toHaveClass('text-white/20');
    });
  });

  describe('content types', () => {
    it('renders with rich content', () => {
      render(
        <SectionLabel>
          <span data-testid="icon">★</span> Featured
        </SectionLabel>,
      );
      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('Featured')).toBeInTheDocument();
    });
  });

  describe('use cases', () => {
    it('renders above headings on marketing pages', () => {
      render(
        <div>
          <SectionLabel>Our Features</SectionLabel>
          <h2>What we offer</h2>
        </div>,
      );
      expect(screen.getByText('Our Features')).toBeInTheDocument();
      expect(screen.getByRole('heading')).toBeInTheDocument();
    });
  });
});
