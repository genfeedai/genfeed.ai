import { fireEvent, render, screen } from '@testing-library/react';
import { OfflinePage } from '@ui/pages/offline/OfflinePage';
import { describe, expect, it, vi } from 'vitest';

// Mock the constants
vi.mock('@ui-constants/pwa/pwa-apps.constant', () => ({
  PWA_APPS: {
    dashboard: {
      description: 'Analytics dashboard',
      displayName: 'Genfeed Dashboard',
      shortName: 'Dashboard',
    },
    manager: {
      description: 'Content management dashboard',
      displayName: 'Genfeed Manager',
      shortName: 'Manager',
    },
    studio: {
      description: 'AI-powered content creation studio',
      displayName: 'Genfeed Studio',
      shortName: 'Studio',
    },
  },
}));

describe('OfflinePage', () => {
  describe('Basic Rendering', () => {
    it('renders the offline message', () => {
      render(<OfflinePage appName="studio" />);
      expect(screen.getByText('You are offline')).toBeInTheDocument();
    });

    it('displays the app name in the message', () => {
      render(<OfflinePage appName="studio" />);
      expect(
        screen.getByText(/Genfeed Studio requires an internet connection/),
      ).toBeInTheDocument();
    });

    it('renders the retry button', () => {
      render(<OfflinePage appName="studio" />);
      expect(
        screen.getByRole('button', { name: 'Try Again' }),
      ).toBeInTheDocument();
    });
  });

  describe('Different App Names', () => {
    it('shows correct name for manager app', () => {
      render(<OfflinePage appName="manager" />);
      expect(
        screen.getByText(/Genfeed Manager requires an internet connection/),
      ).toBeInTheDocument();
    });

    it('shows correct name for dashboard app', () => {
      render(<OfflinePage appName="dashboard" />);
      expect(
        screen.getByText(/Genfeed Dashboard requires an internet connection/),
      ).toBeInTheDocument();
    });
  });

  describe('Retry Functionality', () => {
    it('calls window.location.reload when retry button is clicked', () => {
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      });

      render(<OfflinePage appName="studio" />);
      const retryButton = screen.getByRole('button', {
        name: 'Try Again',
      });

      fireEvent.click(retryButton);

      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    it('retry button has correct type attribute', () => {
      render(<OfflinePage appName="studio" />);
      const retryButton = screen.getByRole('button', {
        name: 'Try Again',
      });
      expect(retryButton).toHaveAttribute('type', 'button');
    });

    it('retry button has default button styling', () => {
      render(<OfflinePage appName="studio" />);
      const retryButton = screen.getByRole('button', {
        name: 'Try Again',
      });
      expect(retryButton).toHaveClass('bg-accent', 'text-accent-foreground');
    });
  });

  describe('Layout and Styling', () => {
    it('renders with fullscreen layout', () => {
      const { container } = render(<OfflinePage appName="studio" />);
      expect(container.firstChild).toHaveClass('min-h-screen');
    });

    it('centers content vertically and horizontally', () => {
      const { container } = render(<OfflinePage appName="studio" />);
      expect(container.firstChild).toHaveClass(
        'flex',
        'items-center',
        'justify-center',
      );
    });

    it('has centered text alignment', () => {
      const { container } = render(<OfflinePage appName="studio" />);
      expect(container.firstChild).toHaveClass('text-center');
    });

    it('uses card background', () => {
      const { container } = render(<OfflinePage appName="studio" />);
      expect(container.firstChild).toHaveClass('bg-card');
    });

    it('title has correct styling', () => {
      render(<OfflinePage appName="studio" />);
      const title = screen.getByText('You are offline');
      expect(title).toHaveClass('text-2xl', 'font-bold', 'text-foreground');
    });

    it('message paragraph has muted text styling', () => {
      render(<OfflinePage appName="studio" />);
      const message = screen.getByText(/requires an internet connection/);
      expect(message).toHaveClass('text-foreground/70');
    });

    it('content is constrained to max-w-md', () => {
      const { container } = render(<OfflinePage appName="studio" />);
      const innerContainer = container.querySelector('.max-w-md');
      expect(innerContainer).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('heading structure is correct', () => {
      render(<OfflinePage appName="studio" />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('You are offline');
    });
  });
});
