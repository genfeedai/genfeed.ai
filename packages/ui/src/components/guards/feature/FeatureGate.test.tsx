import { FeatureFlagProvider } from '@genfeedai/hooks/feature-flags/provider';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import FeatureGate from './FeatureGate';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('FeatureGate', () => {
  it('renders the unavailable state for an explicit product fallback', () => {
    render(
      <FeatureFlagProvider defaults={{}} fallbacks={{ studio: false }}>
        <FeatureGate flagKey="studio">
          <span>Studio content</span>
        </FeatureGate>
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('Feature Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Studio content')).not.toBeInTheDocument();
  });

  it('keeps unconfigured OSS features available', () => {
    render(
      <FeatureFlagProvider defaults={{}}>
        <FeatureGate flagKey="analytics">
          <span>Analytics content</span>
        </FeatureGate>
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('Analytics content')).toBeInTheDocument();
  });
});
