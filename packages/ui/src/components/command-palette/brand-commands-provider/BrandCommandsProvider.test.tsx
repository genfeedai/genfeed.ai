import { useBrandCommands } from '@hooks/commands/use-brand-commands/use-brand-commands';
import { useBrandSwitchHandler } from '@hooks/commands/use-brand-switch-handler/use-brand-switch-handler';
import { render } from '@testing-library/react';
import { BrandCommandsProvider } from '@ui/command-palette/brand-commands-provider/BrandCommandsProvider';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks - using inline factory functions
vi.mock('@hooks/commands/use-brand-commands/use-brand-commands', () => {
  const mockFn = vi.fn();
  return {
    __esModule: true,
    default: mockFn,
    getMock: () => mockFn,
    useBrandCommands: mockFn,
  };
});

vi.mock(
  '@hooks/commands/use-brand-switch-handler/use-brand-switch-handler',
  () => {
    const mockFn = vi.fn(() => vi.fn());
    return {
      __esModule: true,
      getMock: () => mockFn,
      useBrandSwitchHandler: mockFn,
    };
  },
);

vi.mock('@genfeedai/constants', () => ({
  PLATFORM_COLORS: {
    tiktok: '#000000',
    youtube: '#FF0000',
  },
}));

describe('BrandCommandsProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers brand commands when more than one brand is available', async () => {
    const brands = [
      {
        color: '#FF0000',
        id: 'a',
        label: 'Alpha',
        slug: 'alpha',
      },
      { color: '#000000', id: 'b', label: 'Beta', slug: 'beta' },
    ];

    const { container } = render(
      <BrandCommandsProvider brands={brands as never} brandId="a" />,
    );

    expect(container).toBeInTheDocument();
    expect(useBrandCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        brands,
        currentBrandId: 'a',
        enabled: true,
      }),
    );
  });

  it('disables brand commands when only one brand is available', () => {
    const brands = [
      {
        color: '#FF0000',
        id: 'a',
        label: 'Alpha',
        slug: 'alpha',
      },
    ];

    const { container } = render(
      <BrandCommandsProvider brands={brands as never} brandId="a" />,
    );

    expect(container).toBeInTheDocument();
    expect(useBrandCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        brands,
        currentBrandId: 'a',
        enabled: false,
      }),
    );
  });

  it('returns null (renders nothing visible)', () => {
    const brands = [
      { color: '#FF0000', id: 'a', label: 'Alpha', slug: 'alpha' },
    ];

    const { container } = render(
      <BrandCommandsProvider brands={brands as never} brandId="a" />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('wires brand change handler into command registration', () => {
    const brands = [
      { color: '#FF0000', id: 'a', label: 'Alpha', slug: 'alpha' },
      { color: '#000000', id: 'b', label: 'Beta', slug: 'beta' },
    ];
    const onBrandChange = vi.fn();
    const mockSwitch = vi.fn();
    vi.mocked(useBrandSwitchHandler).mockReturnValue(mockSwitch);

    render(
      <BrandCommandsProvider
        brands={brands as never}
        brandId="a"
        onBrandChange={onBrandChange}
      />,
    );

    expect(useBrandSwitchHandler).toHaveBeenCalledWith('a', onBrandChange);
    expect(useBrandCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        onBrandSwitch: mockSwitch,
      }),
    );
  });
});
