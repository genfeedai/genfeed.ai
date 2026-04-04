import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockInit = vi.fn();
const mockDestroy = vi.fn();

vi.mock('@growthbook/growthbook-react', () => {
  function GrowthBookMock() {
    return { destroy: mockDestroy, init: mockInit };
  }

  return {
    GrowthBook: GrowthBookMock,
    GrowthBookProvider: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="gb-provider">{children}</div>
    ),
  };
});

import { GrowthBookClientProvider } from '@hooks/feature-flags/provider/GrowthBookClientProvider';

describe('GrowthBookClientProvider', () => {
  it('renders children when no config is provided', () => {
    render(
      <GrowthBookClientProvider>
        <span>child content</span>
      </GrowthBookClientProvider>,
    );

    expect(screen.getByText('child content')).toBeDefined();
  });

  it('renders children inside GrowthBookProvider when configured', () => {
    render(
      <GrowthBookClientProvider
        apiHost="https://cdn.growthbook.io"
        clientKey="sdk-test-key"
      >
        <span>wrapped content</span>
      </GrowthBookClientProvider>,
    );

    expect(screen.getByTestId('gb-provider')).toBeDefined();
    expect(screen.getByText('wrapped content')).toBeDefined();
  });

  it('calls init with streaming enabled', () => {
    render(
      <GrowthBookClientProvider
        apiHost="https://cdn.growthbook.io"
        clientKey="sdk-test-key"
      >
        <span>test</span>
      </GrowthBookClientProvider>,
    );

    expect(mockInit).toHaveBeenCalledWith({ streaming: true });
  });

  it('does not render GrowthBookProvider when apiHost is empty', () => {
    render(
      <GrowthBookClientProvider apiHost="" clientKey="sdk-key">
        <span>no provider</span>
      </GrowthBookClientProvider>,
    );

    expect(screen.queryByTestId('gb-provider')).toBeNull();
    expect(screen.getByText('no provider')).toBeDefined();
  });

  it('does not render GrowthBookProvider when clientKey is empty', () => {
    render(
      <GrowthBookClientProvider
        apiHost="https://cdn.growthbook.io"
        clientKey=""
      >
        <span>no provider</span>
      </GrowthBookClientProvider>,
    );

    expect(screen.queryByTestId('gb-provider')).toBeNull();
    expect(screen.getByText('no provider')).toBeDefined();
  });
});
