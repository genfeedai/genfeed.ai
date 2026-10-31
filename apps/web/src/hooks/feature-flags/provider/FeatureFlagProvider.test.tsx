import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FeatureFlagProvider,
  useFeatureFlagContext,
} from '@/hooks/feature-flags/provider/FeatureFlagProvider';

function ContextProbe({ label }: { label: string }) {
  const context = useFeatureFlagContext();

  return (
    <div>
      <span>{label}</span>
      <span data-testid="flags">{JSON.stringify(context.flags)}</span>
      <span data-testid="configured">{String(context.isConfigured)}</span>
      <span data-testid="ready">{String(context.isReady)}</span>
    </div>
  );
}

describe('FeatureFlagProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('merges server overrides over public defaults and exposes readiness', () => {
    render(
      <FeatureFlagProvider
        defaults={{ other: true, server_override: true }}
        overrides={{ server_override: false }}
        ready={false}
      >
        <ContextProbe label="override probe" />
      </FeatureFlagProvider>,
    );

    expect(screen.getByTestId('flags')).toHaveTextContent(
      JSON.stringify({ other: true, server_override: false }),
    );
    expect(screen.getByTestId('ready')).toHaveTextContent('false');
  });

  it('merges configured defaults and overrides over product fallbacks', () => {
    render(
      <FeatureFlagProvider
        fallbacks={{ studio: false, workflows: true }}
        defaults={{ studio: true }}
        overrides={{ workflows: false }}
      >
        <ContextProbe label="fallback probe" />
      </FeatureFlagProvider>,
    );

    expect(screen.getByTestId('flags')).toHaveTextContent(
      JSON.stringify({ studio: true, workflows: false }),
    );
  });

  it('marks the provider as unconfigured when no defaults are provided', () => {
    render(
      <FeatureFlagProvider defaults={{}}>
        <ContextProbe label="child content" />
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
    expect(screen.getByTestId('configured')).toHaveTextContent('false');
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
  });

  it('keeps public defaults unconfigured when only server overrides are provided', () => {
    render(
      <FeatureFlagProvider defaults={{}} overrides={{ server_override: true }}>
        <ContextProbe label="override content" />
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('override content')).toBeInTheDocument();
    expect(screen.getByTestId('flags')).toHaveTextContent(
      JSON.stringify({ server_override: true }),
    );
    expect(screen.getByTestId('configured')).toHaveTextContent('false');
  });

  it('keeps product fallbacks available without marking public flags configured', () => {
    render(
      <FeatureFlagProvider defaults={{}} fallbacks={{ studio: false }}>
        <ContextProbe label="fallback content" />
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('fallback content')).toBeInTheDocument();
    expect(screen.getByTestId('flags')).toHaveTextContent(
      JSON.stringify({ studio: false }),
    );
    expect(screen.getByTestId('configured')).toHaveTextContent('false');
  });

  it('renders children when no config is provided', () => {
    render(
      <FeatureFlagProvider defaults={{}}>
        <span>child content</span>
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('marks the provider as configured when defaults are provided', () => {
    render(
      <FeatureFlagProvider defaults={{ analytics: true }}>
        <ContextProbe label="configured content" />
      </FeatureFlagProvider>,
    );

    expect(screen.getByText('configured content')).toBeInTheDocument();
    expect(screen.getByTestId('configured')).toHaveTextContent('true');
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
  });

  it('exposes flag values through context', () => {
    render(
      <FeatureFlagProvider defaults={{ analytics: true, beta: false }}>
        <ContextProbe label="test" />
      </FeatureFlagProvider>,
    );

    expect(screen.getByTestId('flags')).toHaveTextContent(
      JSON.stringify({ analytics: true, beta: false }),
    );
  });
});
