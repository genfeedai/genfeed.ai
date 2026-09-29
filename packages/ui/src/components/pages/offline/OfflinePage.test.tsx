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
  });
});
