import {
  FeatureFlagProvider,
  useFeatureFlagContext,
} from '@hooks/feature-flags/provider/FeatureFlagProvider';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('FeatureFlagProvider', () => {
  it('merges server overrides over public defaults and exposes readiness', () => {
    function Consumer() {
      const context = useFeatureFlagContext();
      return (
        <div>
          <span data-testid="flags">{JSON.stringify(context.flags)}</span>
          <span data-testid="ready">{String(context.isReady)}</span>
        </div>
      );
    }

    render(
      <FeatureFlagProvider
        defaults={{ conversation_shell: true, other: true }}
        overrides={{ conversation_shell: false }}
        ready={false}
      >
        <Consumer />
      </FeatureFlagProvider>,
    );

    expect(screen.getByTestId('flags')).toHaveTextContent(
      JSON.stringify({ conversation_shell: false, other: true }),
    );
    expect(screen.getByTestId('ready')).toHaveTextContent('false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('marks the provider as unconfigured when no defaults are provided', () => {
    let status: { isConfigured: boolean; isReady: boolean } | null = null;

    function Probe() {
      const ctx = useFeatureFlagContext();
      status = { isConfigured: ctx.isConfigured, isReady: ctx.isReady };
      return <span>child content</span>;
    }

    render(
      <FeatureFlagProvider defaults={{}}>
        <Probe />
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('child content')).toBeDefined();
    expect(status).toEqual({ isConfigured: false, isReady: true });
  });

  it('keeps public defaults unconfigured when only server overrides are provided', () => {
    let status: {
      flags: Record<string, unknown>;
      isConfigured: boolean;
    } | null = null;

    function Probe() {
      const ctx = useFeatureFlagContext();
      status = { flags: ctx.flags, isConfigured: ctx.isConfigured };
      return <span>override content</span>;
    }

    render(
      <FeatureFlagProvider
        defaults={{}}
        overrides={{ conversation_shell: true }}
      >
        <Probe />
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('override content')).toBeDefined();
    expect(status).toEqual({
      flags: { conversation_shell: true },
      isConfigured: false,
    });
  });

  it('renders children when no config is provided', () => {
    render(
      <FeatureFlagProvider defaults={{}}>
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

  it('treats invalid environment defaults as configured but empty', () => {
    let status: {
      flags: Record<string, unknown>;
      isConfigured: boolean;
      isReady: boolean;
    } | null = null;
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS', 'not-json');

    function Probe() {
      const ctx = useFeatureFlagContext();
      status = {
        flags: ctx.flags,
        isConfigured: ctx.isConfigured,
        isReady: ctx.isReady,
      };
      return <span>invalid config content</span>;
    }

    render(
      <FeatureFlagProvider>
        <Probe />
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('invalid config content')).toBeDefined();
    expect(status).toEqual({ flags: {}, isConfigured: true, isReady: true });
  });
});
