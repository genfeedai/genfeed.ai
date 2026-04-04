import { render, screen } from '@testing-library/react';
import { SectionLabel } from '@ui/typography/section-label';
import { describe, expect, it, vi } from 'vitest';

describe('SectionLabel', () => {
  it('renders without crashing', () => {
    render(<SectionLabel>Section</SectionLabel>);
    expect(screen.getByText('Section')).toBeInTheDocument();
  });

  it('renders as span element', () => {
    render(<SectionLabel>Label</SectionLabel>);
    expect(screen.getByText('Label').tagName).toBe('SPAN');
  });

  it('renders children text', () => {
    render(<SectionLabel>Features</SectionLabel>);
    expect(screen.getByText('Features')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<SectionLabel className="custom-label">Label</SectionLabel>);
    const label = screen.getByText('Label');
    expect(label).toHaveClass('custom-label');
  });

  it('preserves default styles with custom className', () => {
    render(<SectionLabel className="custom-label">Label</SectionLabel>);
    const label = screen.getByText('Label');
    expect(label).toHaveClass('custom-label');
    expect(label).toHaveClass('uppercase');
    expect(label).toHaveClass('tracking-widest');
    expect(label).toHaveClass('font-black');
  });

  describe('styling', () => {
    it('has text-white/20', () => {
      render(<SectionLabel>Label</SectionLabel>);
      expect(screen.getByText('Label')).toHaveClass('text-white/20');
    });

    it('has text-xs', () => {
      render(<SectionLabel>Label</SectionLabel>);
      expect(screen.getByText('Label')).toHaveClass('text-xs');
    });

    it('has font-black', () => {
      render(<SectionLabel>Label</SectionLabel>);
      expect(screen.getByText('Label')).toHaveClass('font-black');
    });

    it('has uppercase transform', () => {
      render(<SectionLabel>Label</SectionLabel>);
      expect(screen.getByText('Label')).toHaveClass('uppercase');
    });

    it('has tracking-widest', () => {
      render(<SectionLabel>Label</SectionLabel>);
      expect(screen.getByText('Label')).toHaveClass('tracking-widest');
    });

    it('has mb-6 margin', () => {
      render(<SectionLabel>Label</SectionLabel>);
      expect(screen.getByText('Label')).toHaveClass('mb-6');
    });

    it('is block display', () => {
      render(<SectionLabel>Label</SectionLabel>);
      expect(screen.getByText('Label')).toHaveClass('block');
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<SectionLabel id="section-1">Label</SectionLabel>);
      expect(screen.getByText('Label')).toHaveAttribute('id', 'section-1');
    });

    it('forwards data attributes', () => {
      render(<SectionLabel data-testid="custom-label">Label</SectionLabel>);
      expect(screen.getByTestId('custom-label')).toBeInTheDocument();
    });

    it('forwards aria attributes', () => {
      render(<SectionLabel aria-hidden="true">Label</SectionLabel>);
      expect(screen.getByText('Label')).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('content types', () => {
    it('renders plain text', () => {
      render(<SectionLabel>Plain text</SectionLabel>);
      expect(screen.getByText('Plain text')).toBeInTheDocument();
    });

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

  describe('ref forwarding', () => {
    it('forwards ref to span element', () => {
      const ref = vi.fn();
      render(<SectionLabel ref={ref}>Label</SectionLabel>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLSpanElement);
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

    it('can be hidden with custom styling', () => {
      render(
        <SectionLabel className="sr-only">Screen reader only</SectionLabel>,
      );
      expect(screen.getByText('Screen reader only')).toHaveClass('sr-only');
    });
  });
});
