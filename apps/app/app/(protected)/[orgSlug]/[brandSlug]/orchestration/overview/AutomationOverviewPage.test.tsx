import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AutomationOverviewPage from './AutomationOverviewPage';
import '@testing-library/jest-dom';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    organizationId: 'org-123',
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

describe('AutomationOverviewPage', () => {
  beforeAll(() => {
    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds = [];

      disconnect() {}
      observe() {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      unobserve() {}
    }

    Object.defineProperty(globalThis, 'IntersectionObserver', {
      configurable: true,
      value: MockIntersectionObserver,
      writable: true,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(<AutomationOverviewPage />);
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Activity Snapshot')).toBeInTheDocument();
  });

  it('should not include a standalone activities route card', () => {
    render(<AutomationOverviewPage />);
    expect(
      screen.queryByRole('link', { name: /view activities/i }),
    ).not.toBeInTheDocument();
  });

  it('routes workflows through the unified agents workspace', () => {
    render(<AutomationOverviewPage />);

    const workflowLinks = screen.getAllByRole('link', {
      name: /open workflows/i,
    });

    expect(workflowLinks.length).toBeGreaterThan(0);
    for (const workflowLink of workflowLinks) {
      expect(workflowLink).toHaveAttribute('href', '/workflows');
    }
    expect(screen.getByText('Workflows')).toBeInTheDocument();
  });

  it('uses the darker tinted quick-action icon palette', () => {
    const { container } = render(<AutomationOverviewPage />);

    expect(container.querySelector('.bg-cyan-500\\/12')).toBeInTheDocument();
    expect(container.querySelector('.bg-cyan-100')).not.toBeInTheDocument();
  });

  it('uses the standard section heading style for activity snapshot', () => {
    render(<AutomationOverviewPage />);

    const heading = screen.getByRole('heading', { name: 'Activity Snapshot' });

    expect(heading).toHaveClass(
      'text-xl',
      'font-semibold',
      'tracking-[-0.02em]',
      'text-foreground',
    );
    expect(heading).not.toHaveClass('font-serif', 'italic');
  });
});
