import type { ProviderModel } from '@genfeedai/types';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelBrowserModal } from './ModelBrowserModal';

const { mockAddRecentModel } = vi.hoisted(() => ({
  mockAddRecentModel: vi.fn(),
}));

// The component calls useSettingsStore with individual selectors:
// useSettingsStore((s) => s.recentModels)
// useSettingsStore((s) => s.addRecentModel)
// useSettingsStore((s) => s.providers.replicate.apiKey) etc.
vi.mock('@/store/settingsStore', () => {
  const state = {
    addRecentModel: mockAddRecentModel,
    providers: {
      fal: { apiKey: null },
      huggingface: { apiKey: null },
      replicate: { apiKey: 'test-key' },
    },
    recentModels: [
      { displayName: 'FLUX.1-dev', id: 'flux-dev', provider: 'replicate' },
    ],
  };

  return {
    useSettingsStore: vi.fn((selector: (s: unknown) => unknown) =>
      selector(state),
    ),
  };
});

// Mock logger to prevent console output in tests
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

describe('ModelBrowserModal', () => {
  const originalFetch = global.fetch;
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
  };

  const mockModels: ProviderModel[] = [
    {
      capabilities: ['text-to-image'],
      description: 'High quality image generation',
      displayName: 'FLUX.1-dev',
      id: 'flux-dev',
      pricing: '$0.05/image',
      provider: 'replicate',
    },
    {
      capabilities: ['text-to-image', 'image-to-image'],
      description: 'Fast image generation',
      displayName: 'Stable Diffusion XL',
      id: 'stable-diffusion-xl',
      pricing: '$0.02/image',
      provider: 'replicate',
    },
    {
      capabilities: ['text-to-image'],
      displayName: 'FAL FLUX',
      id: 'fal-flux',
      provider: 'fal',
    },
  ];

  const mockFetchResponse = {
    json: () =>
      Promise.resolve({
        configuredProviders: ['replicate', 'fal', 'huggingface'],
        models: mockModels,
      }),
    ok: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('rendering', () => {
    it('should not render when not open', () => {
      const { container } = render(
        <ModelBrowserModal {...defaultProps} isOpen={false} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render modal when open', () => {
      render(<ModelBrowserModal {...defaultProps} />);

      expect(screen.getByText('Browse Models')).toBeInTheDocument();
    });

    it('should render custom title', () => {
      render(
        <ModelBrowserModal {...defaultProps} title="Select Image Model" />,
      );

      expect(screen.getByText('Select Image Model')).toBeInTheDocument();
    });

    it('should render search input', () => {
      render(<ModelBrowserModal {...defaultProps} />);

      expect(
        screen.getByPlaceholderText('Search models...'),
      ).toBeInTheDocument();
    });

    it('should render provider filter buttons after fetch', async () => {
      render(<ModelBrowserModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      expect(screen.getAllByText('Replicate').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('fal.ai').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Hugging Face')).toBeInTheDocument();
    });
  });

  describe('model loading', () => {
    it('should fetch models on open', async () => {
      render(<ModelBrowserModal {...defaultProps} />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it('should display models after loading', async () => {
      render(<ModelBrowserModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getAllByText('FLUX.1-dev').length).toBeGreaterThanOrEqual(
          1,
        );
      });

      expect(screen.getByText('Stable Diffusion XL')).toBeInTheDocument();
    });

    it('should show loading spinner during fetch', async () => {
      let resolveFetch: ((value: Response) => void) | undefined;
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ) as unknown as typeof fetch;

      render(<ModelBrowserModal {...defaultProps} />);

      await waitFor(() => {
        expect(document.querySelector('.animate-spin')).toBeInTheDocument();
      });

      await act(async () => {
        resolveFetch?.(mockFetchResponse as Response);
      });

      await waitFor(() => {
        expect(screen.getAllByText('FLUX.1-dev').length).toBeGreaterThanOrEqual(
          1,
        );
      });
    });
  });

  describe('search functionality', () => {
    it('should pass search query to API', async () => {
      render(<ModelBrowserModal {...defaultProps} />);

      // Wait for initial fetch
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const searchInput = screen.getByPlaceholderText('Search models...');
      fireEvent.change(searchInput, { target: { value: 'flux' } });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('query=flux'),
          expect.any(Object),
        );
      });
    });
  });

  describe('provider filtering', () => {
    it('should filter by provider when clicked', async () => {
      render(<ModelBrowserModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getAllByText('fal.ai').length).toBeGreaterThanOrEqual(1);
      });

      const falButtons = screen.getAllByText('fal.ai');
      fireEvent.click(falButtons[0]);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('provider=fal'),
          expect.any(Object),
        );
      });
    });
  });

  describe('model selection', () => {
    it('should call onSelect when model is clicked', async () => {
      render(<ModelBrowserModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getAllByText('FLUX.1-dev').length).toBeGreaterThanOrEqual(
          1,
        );
      });

      const fluxElements = screen.getAllByText('FLUX.1-dev');
      const modelCard = fluxElements[0].closest('button');
      if (modelCard) fireEvent.click(modelCard);

      expect(defaultProps.onSelect).toHaveBeenCalledWith(mockModels[0]);
    });

    it('should add model to recent models', async () => {
      render(<ModelBrowserModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getAllByText('FLUX.1-dev').length).toBeGreaterThanOrEqual(
          1,
        );
      });

      const fluxElements = screen.getAllByText('FLUX.1-dev');
      const modelCard = fluxElements[0].closest('button');
      if (modelCard) fireEvent.click(modelCard);

      expect(mockAddRecentModel).toHaveBeenCalledWith({
        displayName: 'FLUX.1-dev',
        id: 'flux-dev',
        provider: 'replicate',
      });
    });

    it('should close modal after selection', async () => {
      render(<ModelBrowserModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getAllByText('FLUX.1-dev').length).toBeGreaterThanOrEqual(
          1,
        );
      });

      const fluxElements = screen.getAllByText('FLUX.1-dev');
      const modelCard = fluxElements[0].closest('button');
      if (modelCard) fireEvent.click(modelCard);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('close modal', () => {
    it('should close on backdrop click', () => {
      render(<ModelBrowserModal {...defaultProps} />);

      const backdrop = document.querySelector('.bg-black\\/50');
      if (backdrop) fireEvent.click(backdrop);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should close on X button click', () => {
      render(<ModelBrowserModal {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      const closeButton = buttons.find((btn) => {
        const svg = btn.querySelector('svg');
        return svg !== null && btn.textContent === '';
      });
      if (closeButton) fireEvent.click(closeButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('capability filtering', () => {
    it('should pass capabilities to API', async () => {
      render(
        <ModelBrowserModal
          {...defaultProps}
          capabilities={['text-to-image', 'image-to-image']}
        />,
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(
            'capabilities=text-to-image%2Cimage-to-image',
          ),
          expect.any(Object),
        );
      });
    });
  });

  describe('empty state', () => {
    it('should show empty state when no models found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ configuredProviders: [], models: [] }),
        ok: true,
      }) as unknown as typeof fetch;

      render(<ModelBrowserModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No models found')).toBeInTheDocument();
      });
    });
  });

  describe('model count', () => {
    it('should show model count in footer', async () => {
      render(<ModelBrowserModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('3 models available')).toBeInTheDocument();
      });
    });

    it('should use singular form for one model', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            configuredProviders: ['replicate'],
            models: [mockModels[0]],
          }),
        ok: true,
      }) as unknown as typeof fetch;

      render(<ModelBrowserModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('1 model available')).toBeInTheDocument();
      });
    });
  });
});
