import {
  FeatureFlagProvider,
  useFeatureFlagContext,
} from '@hooks/feature-flags/provider/FeatureFlagProvider';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('FeatureFlagProvider', () => {
  it('marks the provider as unconfigured when no defaults are provided', () => {
    let status: { isConfigured: boolean; isReady: boolean } | null = null;

    function Probe() {
      const ctx = useFeatureFlagContext();
      status = { isConfigured: ctx.isConfigured, isReady: ctx.isReady };
      return <span>child content</span>;
    }

    render(
      <FeatureFlagProvider>
        <Probe />
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('child content')).toBeDefined();
    expect(status).toEqual({ isConfigured: false, isReady: true });
  });

  it('renders children when no config is provided', () => {
    render(
      <FeatureFlagProvider>
        <span>child content</span>
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('child content')).toBeDefined();
  });

  it('marks the provider as configured when defaults are provided', () => {
    let status: { isConfigured: boolean; isReady: boolean } | null = null;

    function Probe() {
      const ctx = useFeatureFlagContext();
      status = { isConfigured: ctx.isConfigured, isReady: ctx.isReady };
      return <span>configured content</span>;
    }

    render(
      <FeatureFlagProvider defaults={{ analytics: true }}>
        <Probe />
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('configured content')).toBeDefined();
    expect(status).toEqual({ isConfigured: true, isReady: true });
  });

  it('exposes flag values through context', () => {
    let flags: Record<string, unknown> = {};

    function Probe() {
      const ctx = useFeatureFlagContext();
      flags = ctx.flags;
      return <span>test</span>;
    }

    render(
      <FeatureFlagProvider defaults={{ analytics: true, beta: false }}>
        <Probe />
      </FeatureFlagProvider>,
    );

    expect(flags).toEqual({ analytics: true, beta: false });
  });
});
