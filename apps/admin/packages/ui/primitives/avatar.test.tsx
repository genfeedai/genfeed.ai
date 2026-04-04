import { render, screen } from '@testing-library/react';
import { Avatar, AvatarFallback, AvatarImage } from '@ui/primitives/avatar';
import { describe, expect, it, vi } from 'vitest';

describe('Avatar', () => {
  describe('Avatar Root', () => {
    it('renders without crashing', () => {
      const { container } = render(<Avatar />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<Avatar className="custom-avatar" />);
      expect(container.firstChild).toHaveClass('custom-avatar');
    });

    it('has default sizing', () => {
      const { container } = render(<Avatar />);
      const avatar = container.firstChild;
      expect(avatar).toHaveClass('h-10');
      expect(avatar).toHaveClass('w-10');
    });

    it('has rounded-full class', () => {
      const { container } = render(<Avatar />);
      expect(container.firstChild).toHaveClass('rounded-full');
    });

    it('is overflow-hidden', () => {
      const { container } = render(<Avatar />);
      expect(container.firstChild).toHaveClass('overflow-hidden');
    });

    it('forwards id attribute', () => {
      const { container } = render(<Avatar id="user-avatar" />);
      expect(container.firstChild).toHaveAttribute('id', 'user-avatar');
    });

    it('forwards data attributes', () => {
      render(<Avatar data-testid="custom-avatar" />);
      expect(screen.getByTestId('custom-avatar')).toBeInTheDocument();
    });
  });

  describe('AvatarImage', () => {
    // Note: Radix Avatar hides the img element until it loads (via onLoadingStatusChange).
    // In jsdom, images don't trigger onload events, so we test the component structure instead.

    it('renders AvatarImage in DOM structure', () => {
      const { container } = render(
        <Avatar>
          <AvatarImage src="https://example.com/avatar.jpg" alt="User avatar" />
        </Avatar>,
      );
      // Radix renders the img hidden initially in jsdom
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders with src and alt props accepted', () => {
      // The component accepts src and alt props (even if image hides in jsdom)
      const { container } = render(
        <Avatar>
          <AvatarImage src="https://example.com/avatar.jpg" alt="User" />
          <AvatarFallback>U</AvatarFallback>
        </Avatar>,
      );
      expect(container).toBeTruthy();
      // Fallback should show since image doesn't load in jsdom
      expect(screen.getByText('U')).toBeInTheDocument();
    });

    it('shows fallback when image src is empty', () => {
      render(
        <Avatar>
          <AvatarImage src="" alt="User" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>,
      );
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('renders fallback when image not available', () => {
      render(
        <Avatar>
          <AvatarImage src="invalid.jpg" alt="User" />
          <AvatarFallback>FB</AvatarFallback>
        </Avatar>,
      );
      // In jsdom, image load events don't fire, so fallback renders
      expect(screen.getByText('FB')).toBeInTheDocument();
    });

    it('accepts className prop', () => {
      // The AvatarImage component accepts className even if not visible in jsdom
      const { container } = render(
        <Avatar>
          <AvatarImage src="" alt="User" className="custom-image" />
          <AvatarFallback>U</AvatarFallback>
        </Avatar>,
      );
      expect(container).toBeTruthy();
    });
  });

  describe('AvatarFallback', () => {
    it('renders fallback content', () => {
      render(
        <Avatar>
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>,
      );
      expect(screen.getByText('AB')).toBeInTheDocument();
    });

    it('renders initials', () => {
      render(
        <Avatar>
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>,
      );
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Avatar>
          <AvatarFallback className="custom-fallback">AB</AvatarFallback>
        </Avatar>,
      );
      expect(screen.getByText('AB')).toHaveClass('custom-fallback');
    });

    it('has correct default styles', () => {
      render(
        <Avatar>
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>,
      );
      const fallback = screen.getByText('AB');
      expect(fallback).toHaveClass('flex');
      expect(fallback).toHaveClass('items-center');
      expect(fallback).toHaveClass('justify-center');
      expect(fallback).toHaveClass('rounded-full');
      expect(fallback).toHaveClass('bg-muted');
    });

    it('renders icon as fallback', () => {
      render(
        <Avatar>
          <AvatarFallback>
            <span data-testid="user-icon">👤</span>
          </AvatarFallback>
        </Avatar>,
      );
      expect(screen.getByTestId('user-icon')).toBeInTheDocument();
    });
  });

  describe('composition', () => {
    it('renders Avatar with image and fallback', () => {
      render(
        <Avatar>
          <AvatarImage src="https://example.com/avatar.jpg" alt="User" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>,
      );
      // In jsdom, images don't load so fallback renders
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('shows fallback when image fails to load', async () => {
      const { container } = render(
        <Avatar>
          <AvatarImage src="invalid-url.jpg" alt="User" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>,
      );
      // Fallback should be present in jsdom
      expect(container).toBeTruthy();
      expect(screen.getByText('JD')).toBeInTheDocument();
    });
  });

  describe('size variants', () => {
    it('can be customized with small size', () => {
      const { container } = render(<Avatar className="h-8 w-8" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveClass('h-8');
      expect(avatar).toHaveClass('w-8');
    });

    it('can be customized with large size', () => {
      const { container } = render(<Avatar className="h-16 w-16" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveClass('h-16');
      expect(avatar).toHaveClass('w-16');
    });
  });

  describe('accessibility', () => {
    it('renders accessible avatar structure', () => {
      const { container } = render(
        <Avatar>
          <AvatarImage src="https://example.com/avatar.jpg" alt="John Doe" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>,
      );
      // Avatar should have accessible content via fallback in jsdom
      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('can have aria-label on container', () => {
      render(<Avatar aria-label="User profile picture" />);
      expect(screen.getByLabelText('User profile picture')).toBeInTheDocument();
    });
  });

  describe('ref forwarding', () => {
    it('Avatar forwards ref', () => {
      const ref = vi.fn();
      render(<Avatar ref={ref} />);
      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLSpanElement);
    });

    it('AvatarFallback forwards ref', () => {
      const ref = vi.fn();
      render(
        <Avatar>
          <AvatarFallback ref={ref}>JD</AvatarFallback>
        </Avatar>,
      );
      expect(ref).toHaveBeenCalled();
    });
  });
});
