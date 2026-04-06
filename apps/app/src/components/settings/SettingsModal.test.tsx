import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from './SettingsModal';

const mockSetDefaultModel = vi.fn();
const mockSetEdgeStyle = vi.fn();
const mockSetShowMinimap = vi.fn();
const mockSetDebugMode = vi.fn();
const mockCloseModal = vi.fn();
const mockOpenModal = vi.fn();

// Import mocked modules at top level (vi.mock is hoisted above these imports)
import { useUIStore } from '@genfeedai/workflow-ui/stores';

const mockedUIStore = vi.mocked(useUIStore);

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select">{children}</div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <div data-testid={`select-item-${value}`}>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="select-trigger">{children}</button>
  ),
  SelectValue: () => <span data-testid="select-value" />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/store/settingsStore', () => ({
  LLM_PROVIDERS: {
    anthropic: {
      description: 'Claude models',
      docsUrl: 'https://console.anthropic.com/settings/keys',
      keyPlaceholder: 'sk-ant-...',
      keyPrefix: 'sk-ant-',
      models: [],
      name: 'Anthropic',
    },
    openai: {
      description: 'GPT models',
      docsUrl: 'https://platform.openai.com/api-keys',
      keyPlaceholder: 'sk-...',
      keyPrefix: 'sk-',
      models: [],
      name: 'OpenAI',
    },
    replicate: {
      description: 'Open-source models via Replicate',
      docsUrl: 'https://replicate.com/account/api-tokens',
      keyPlaceholder: 'r8_...',
      keyPrefix: 'r8_',
      models: [],
      name: 'Replicate',
    },
  },
  PROVIDER_INFO: {
    fal: {
      description: 'Fast inference for image and video generation',
      docsUrl: 'https://fal.ai/docs',
      name: 'fal.ai',
    },
    huggingface: {
      description: 'The AI community platform with 500k+ models',
      docsUrl: 'https://huggingface.co/docs/api-inference',
      name: 'Hugging Face',
    },
    replicate: {
      description: 'Access thousands of open-source AI models',
      docsUrl: 'https://replicate.com/docs',
      name: 'Replicate',
    },
  },
  useSettingsStore: vi.fn(
    (selector?: (state: Record<string, unknown>) => unknown) => {
      const state = {
        clearLLMProviderKey: vi.fn(),
        debugMode: false,
        defaults: {
          imageModel: 'nano-banana-pro',
          imageProvider: 'replicate',
          videoModel: 'veo-3.1',
          videoProvider: 'replicate',
        },
        edgeStyle: 'default',
        llm: {
          activeProvider: 'anthropic',
          providers: {
            anthropic: {
              apiKey: null,
              defaultModel: 'claude-sonnet-4-6',
              enabled: false,
            },
            openai: {
              apiKey: null,
              defaultModel: 'gpt-4.1-mini',
              enabled: false,
            },
            replicate: {
              apiKey: null,
              defaultModel: 'meta/meta-llama-3.1-405b-instruct',
              enabled: false,
            },
          },
        },
        providers: {
          fal: { apiKey: null, enabled: true },
          huggingface: { apiKey: null, enabled: true },
          replicate: { apiKey: null, enabled: true },
        },
        setDebugMode: mockSetDebugMode,
        setDefaultModel: mockSetDefaultModel,
        setEdgeStyle: mockSetEdgeStyle,
        setLLMActiveProvider: vi.fn(),
        setLLMProviderEnabled: vi.fn(),
        setLLMProviderKey: vi.fn(),
        setShowMinimap: mockSetShowMinimap,
        showMinimap: true,
      };
      return selector ? selector(state) : state;
    },
  ),
}));

vi.mock('@genfeedai/workflow-ui/stores', () => ({
  useUIStore: vi.fn(() => ({
    activeModal: 'settings',
    closeModal: mockCloseModal,
    openModal: mockOpenModal,
  })),
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUIStore.mockReturnValue({
      activeModal: 'settings',
      closeModal: mockCloseModal,
      openModal: mockOpenModal,
    } as unknown as ReturnType<typeof useUIStore>);
  });

  describe('rendering', () => {
    it('should render modal when activeModal is settings', () => {
      render(<SettingsModal />);

      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should render all tabs', () => {
      render(<SettingsModal />);

      expect(screen.getByText('Defaults')).toBeInTheDocument();
      expect(screen.getByText('API Keys')).toBeInTheDocument();
      expect(screen.getByText('Appearance')).toBeInTheDocument();
      expect(screen.getByText('Developer')).toBeInTheDocument();
      expect(screen.getByText('Help')).toBeInTheDocument();
    });

    it('should show defaults tab by default', () => {
      render(<SettingsModal />);

      expect(screen.getByText('Default Image Model')).toBeInTheDocument();
      expect(screen.getByText('Default Video Model')).toBeInTheDocument();
      expect(screen.getByText('Default Provider')).toBeInTheDocument();
    });
  });

  describe('tab navigation', () => {
    it('should switch to API Keys tab', () => {
      render(<SettingsModal />);

      fireEvent.click(screen.getByText('API Keys'));

      expect(screen.getByText('AI Assistant (BYOK)')).toBeInTheDocument();
      expect(
        screen.getByText('Content Generation (Server)'),
      ).toBeInTheDocument();
    });

    it('should switch to appearance tab', () => {
      render(<SettingsModal />);

      fireEvent.click(screen.getByText('Appearance'));

      expect(screen.getByText('Edge Style')).toBeInTheDocument();
      expect(screen.getByText('Curved')).toBeInTheDocument();
      expect(screen.getByText('Smooth Step')).toBeInTheDocument();
      expect(screen.getByText('Straight')).toBeInTheDocument();
    });

    it('should switch to developer tab', () => {
      render(<SettingsModal />);

      fireEvent.click(screen.getByText('Developer'));

      expect(screen.getByText('Debug Mode')).toBeInTheDocument();
    });

    it('should switch to help tab', () => {
      render(<SettingsModal />);

      fireEvent.click(screen.getByText('Help'));

      expect(screen.getByText('Show Welcome Screen')).toBeInTheDocument();
      expect(screen.getByText('Documentation')).toBeInTheDocument();
      expect(screen.getByText('Discord Community')).toBeInTheDocument();
    });
  });

  describe('close modal', () => {
    it('should close modal on backdrop click', () => {
      render(<SettingsModal />);

      const backdrop = document.querySelector('.bg-black\\/50');
      if (backdrop) fireEvent.click(backdrop);

      expect(mockCloseModal).toHaveBeenCalled();
    });

    it('should close modal on X button click', () => {
      render(<SettingsModal />);

      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons.find((btn) =>
        btn.querySelector('svg.lucide-x'),
      );
      if (closeButton) fireEvent.click(closeButton);

      expect(mockCloseModal).toHaveBeenCalled();
    });
  });

  describe('hidden when not active', () => {
    it('should not render when activeModal is not settings', () => {
      mockedUIStore.mockReturnValue({
        activeModal: null,
        closeModal: mockCloseModal,
        openModal: mockOpenModal,
      } as unknown as ReturnType<typeof useUIStore>);

      const { container } = render(<SettingsModal />);

      expect(container.firstChild).toBeNull();
    });
  });
});

describe('SettingsModal - API Keys Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUIStore.mockReturnValue({
      activeModal: 'settings',
      closeModal: mockCloseModal,
      openModal: mockOpenModal,
    } as unknown as ReturnType<typeof useUIStore>);
  });

  it('should show env file configuration notice', () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByText('API Keys'));

    expect(
      screen.getByText('Configured via .env files on the server'),
    ).toBeInTheDocument();
  });

  it('should render provider names in API key status list', () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByText('API Keys'));

    expect(screen.getAllByText('Replicate').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('fal.ai')).toBeInTheDocument();
    expect(screen.getByText('Hugging Face')).toBeInTheDocument();
  });

  it('should render external links to get API keys', () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByText('API Keys'));

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(4);
  });
});

describe('SettingsModal - Appearance Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUIStore.mockReturnValue({
      activeModal: 'settings',
      closeModal: mockCloseModal,
      openModal: mockOpenModal,
    } as unknown as ReturnType<typeof useUIStore>);
  });

  it('should call setEdgeStyle on edge style selection', () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByText('Appearance'));

    const straightButton = screen.getByText('Straight').closest('button');
    if (straightButton) fireEvent.click(straightButton);

    expect(mockSetEdgeStyle).toHaveBeenCalledWith('straight');
  });

  it('should render edge preview', () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByText('Appearance'));

    expect(screen.getByText('Node A')).toBeInTheDocument();
    expect(screen.getByText('Node B')).toBeInTheDocument();
  });

  it('should render minimap toggle', () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByText('Appearance'));

    expect(screen.getByText('Show Minimap')).toBeInTheDocument();
  });
});
