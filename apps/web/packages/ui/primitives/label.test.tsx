import { render, screen } from '@testing-library/react';
import { Label } from '@ui/primitives/label';
import { describe, expect, it, vi } from 'vitest';

describe('Label', () => {
  it('renders without crashing', () => {
    render(<Label>Username</Label>);
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<Label>Email Address</Label>);
    expect(screen.getByText('Email Address')).toBeInTheDocument();
  });

  it('renders as label element', () => {
    render(<Label>Name</Label>);
    expect(screen.getByText('Name').tagName).toBe('LABEL');
  });

  it('applies custom className', () => {
    render(<Label className="custom-label">Label</Label>);
    expect(screen.getByText('Label')).toHaveClass('custom-label');
  });

  it('preserves default styles with custom className', () => {
    render(<Label className="custom-label">Label</Label>);
    const label = screen.getByText('Label');
    expect(label).toHaveClass('custom-label');
    expect(label).toHaveClass('text-sm');
    expect(label).toHaveClass('font-medium');
  });

  it('associates with input via htmlFor', () => {
    render(
      <div>
        <Label htmlFor="email-input">Email</Label>
        <input id="email-input" type="email" />
      </div>,
    );
    const label = screen.getByText('Email');
    const input = screen.getByRole('textbox');
    expect(label).toHaveAttribute('for', 'email-input');
    expect(input).toHaveAttribute('id', 'email-input');
  });

  it('is linked to associated input via for attribute', () => {
    render(
      <div>
        <Label htmlFor="username">Username</Label>
        <input id="username" type="text" />
      </div>,
    );
    const label = screen.getByText('Username');
    const input = screen.getByRole('textbox');
    expect(label).toHaveAttribute('for', 'username');
    expect(input).toHaveAttribute('id', 'username');
  });

  describe('styling', () => {
    it('has text-sm', () => {
      render(<Label>Label</Label>);
      expect(screen.getByText('Label')).toHaveClass('text-sm');
    });

    it('has font-medium', () => {
      render(<Label>Label</Label>);
      expect(screen.getByText('Label')).toHaveClass('font-medium');
    });

    it('has leading-none', () => {
      render(<Label>Label</Label>);
      expect(screen.getByText('Label')).toHaveClass('leading-none');
    });

    it('has peer-disabled styles', () => {
      render(<Label>Label</Label>);
      const label = screen.getByText('Label');
      expect(label).toHaveClass('peer-disabled:cursor-not-allowed');
      expect(label).toHaveClass('peer-disabled:opacity-70');
    });
  });

  describe('with form elements', () => {
    it('wraps input inline', () => {
      render(
        <Label>
          Username
          <input type="text" />
        </Label>,
      );
      expect(screen.getByText('Username')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('works with checkbox', () => {
      render(
        <div>
          <Label htmlFor="agree">I agree to terms</Label>
          <input id="agree" type="checkbox" />
        </div>,
      );
      expect(screen.getByText('I agree to terms')).toBeInTheDocument();
    });

    it('works with select', () => {
      render(
        <div>
          <Label htmlFor="country">Country</Label>
          <select id="country">
            <option value="us">United States</option>
          </select>
        </div>,
      );
      const label = screen.getByText('Country');
      expect(label).toHaveAttribute('for', 'country');
    });
  });

  describe('HTML attributes', () => {
    it('forwards id attribute', () => {
      render(<Label id="my-label">Label</Label>);
      expect(screen.getByText('Label')).toHaveAttribute('id', 'my-label');
    });

    it('forwards data attributes', () => {
      render(<Label data-testid="custom-label">Label</Label>);
      expect(screen.getByTestId('custom-label')).toBeInTheDocument();
    });

    it('forwards aria attributes', () => {
      render(<Label aria-required="true">Required Field</Label>);
      expect(screen.getByText('Required Field')).toHaveAttribute(
        'aria-required',
        'true',
      );
    });
  });

  describe('ref forwarding', () => {
    it('forwards ref to label element', () => {
      const ref = vi.fn();
      render(<Label ref={ref}>Label</Label>);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLLabelElement);
    });
  });

  describe('content types', () => {
    it('renders plain text', () => {
      render(<Label>Plain text label</Label>);
      expect(screen.getByText('Plain text label')).toBeInTheDocument();
    });

    it('renders rich content', () => {
      render(
        <Label>
          Required <span className="text-red-500">*</span>
        </Label>,
      );
      expect(screen.getByText('Required')).toBeInTheDocument();
    });

    it('renders with icon', () => {
      render(
        <Label>
          <span data-testid="icon">📧</span>
          Email
        </Label>,
      );
      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
    });
  });
});
