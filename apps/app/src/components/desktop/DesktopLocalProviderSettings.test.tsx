import '@testing-library/jest-dom/vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopLocalProviderSettings from './DesktopLocalProviderSettings';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  const translate = translateFromCatalog('common.desktop.provider');

  return { useTranslations: () => translate };
});

const mocks = vi.hoisted(() => ({
  bridge: null as null | {
    app: {
      enableOfflineMode: ReturnType<typeof vi.fn>;
      getBootstrap: ReturnType<typeof vi.fn>;
    };
    generation: {
      getProviderConfig: ReturnType<typeof vi.fn>;
      saveProviderConfig: ReturnType<typeof vi.fn>;
      testProviderConfig: ReturnType<typeof vi.fn>;
    };
  },
  enableOfflineMode: vi.fn(),
  getBootstrap: vi.fn(),
  getProviderConfig: vi.fn(),
  saveProviderConfig: vi.fn(),
  testProviderConfig: vi.fn(),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    bodyClassName,
    children,
    className,
  }: {
    bodyClassName?: string;
    children: ReactNode;
    className?: string;
  }) => <section className={bodyClassName ?? className}>{children}</section>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    disabled,
    onClick,
    type = 'button',
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    type?: 'button' | 'submit';
  }) => (
    <button type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/primitives/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock('@/lib/desktop/runtime', () => ({
  getDesktopBridge: () => mocks.bridge,
}));

function setupBridge() {
  mocks.bridge = {
    app: {
      enableOfflineMode: mocks.enableOfflineMode,
      getBootstrap: mocks.getBootstrap,
    },
    generation: {
      getProviderConfig: mocks.getProviderConfig,
      saveProviderConfig: mocks.saveProviderConfig,
      testProviderConfig: mocks.testProviderConfig,
    },
  };
}

describe('DesktopLocalProviderSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBridge();
    mocks.getBootstrap.mockResolvedValue({ isOfflineMode: true });
    mocks.getProviderConfig.mockResolvedValue({
      apiKeyConfigured: true,
      baseUrl: 'http://localhost:9999/v1',
      displayName: 'Saved Ollama',
      model: 'saved-model',
      provider: 'ollama',
    });
    mocks.saveProviderConfig.mockResolvedValue({
      apiKeyConfigured: true,
      displayName: 'OpenAI-compatible',
      model: 'gpt-local',
    });
    mocks.testProviderConfig.mockResolvedValue({ latencyMs: 123 });
  });

  it('loads an existing local provider config', async () => {
    render(<DesktopLocalProviderSettings />);

    await waitFor(() => {
      expect(screen.getByText('Local generation')).toBeInTheDocument();
      expect(screen.getByLabelText('Local provider base URL')).toHaveValue(
        'http://localhost:9999/v1',
      );
      expect(screen.getByLabelText('Local provider model')).toHaveValue(
        'saved-model',
      );
      expect(screen.getByPlaceholderText('API key saved')).toBeInTheDocument();
    });
  });

  it('does not touch local provider storage while cloud mode is active', async () => {
    mocks.getBootstrap.mockResolvedValue({ isOfflineMode: false });
    render(<DesktopLocalProviderSettings />);

    expect(await screen.findByText('Local generation is off')).toBeVisible();
    expect(mocks.getProviderConfig).not.toHaveBeenCalled();
  });

  it('applies provider presets and saves trimmed provider credentials', async () => {
    render(<DesktopLocalProviderSettings variant="card" />);

    expect(
      await screen.findByText(/Configure a local OpenAI-compatible provider/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'OpenAI-compatible' }));
    expect(screen.getByLabelText('Local provider base URL')).toHaveValue(
      'http://localhost:8000/v1',
    );
    expect(screen.getByLabelText('Local provider model')).toHaveValue(
      'gpt-4o-mini',
    );

    fireEvent.change(screen.getByLabelText('Local provider API key'), {
      target: { value: '  local-secret  ' },
    });
    fireEvent.change(screen.getByLabelText('Local provider model'), {
      target: { value: 'gpt-local' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mocks.saveProviderConfig).toHaveBeenCalledWith({
        apiKey: 'local-secret',
        baseUrl: 'http://localhost:8000/v1',
        displayName: 'OpenAI-compatible',
        model: 'gpt-local',
        provider: 'openai-compatible',
      });
      expect(screen.getByText('Using OpenAI-compatible.')).toBeInTheDocument();
      expect(screen.getByLabelText('Local provider API key')).toHaveValue('');
    });
  });

  it('tests the current provider payload and reports latency', async () => {
    render(<DesktopLocalProviderSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'fal.ai' }));
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));

    await waitFor(() => {
      expect(mocks.testProviderConfig).toHaveBeenCalledWith({
        baseUrl: 'https://queue.fal.run',
        displayName: 'fal.ai',
        model: 'fal-ai/any-llm',
        provider: 'fal',
      });
      expect(screen.getByText('Connected in 123ms.')).toBeInTheDocument();
    });
  });

  it('shows load errors without exposing provider storage actions', async () => {
    mocks.getProviderConfig.mockRejectedValueOnce(new Error('load exploded'));
    render(<DesktopLocalProviderSettings />);

    expect(await screen.findByText('load exploded')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
  });

  it('shows save and test errors', async () => {
    render(<DesktopLocalProviderSettings />);
    await screen.findByRole('button', { name: 'Save' });

    mocks.saveProviderConfig.mockRejectedValueOnce(new Error('save exploded'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('save exploded')).toBeInTheDocument();

    mocks.testProviderConfig.mockRejectedValueOnce(new Error('test exploded'));
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('test exploded')).toBeInTheDocument();
  });

  it('does nothing without a desktop bridge', () => {
    mocks.bridge = null;

    render(<DesktopLocalProviderSettings />);

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Use a local workspace' }),
    ).toBeDisabled();
    expect(mocks.getProviderConfig).not.toHaveBeenCalled();
    expect(mocks.saveProviderConfig).not.toHaveBeenCalled();
    expect(mocks.testProviderConfig).not.toHaveBeenCalled();
  });

  it('keeps provider storage actions unavailable until local mode is confirmed', async () => {
    let resolveBootstrap:
      | ((value: { isOfflineMode: boolean }) => void)
      | undefined;
    mocks.getBootstrap.mockImplementationOnce(
      () =>
        new Promise<{ isOfflineMode: boolean }>((resolve) => {
          resolveBootstrap = resolve;
        }),
    );
    render(<DesktopLocalProviderSettings />);

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Use a local workspace' }),
    ).toBeDisabled();
    expect(mocks.getProviderConfig).not.toHaveBeenCalled();

    await act(async () => {
      resolveBootstrap?.({ isOfflineMode: true });
    });

    expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled();
    expect(mocks.getProviderConfig).toHaveBeenCalledOnce();
  });

  it('stops provider loading after unmount', async () => {
    let resolveBootstrap:
      | ((value: { isOfflineMode: boolean }) => void)
      | undefined;
    mocks.getBootstrap.mockImplementationOnce(
      () =>
        new Promise<{ isOfflineMode: boolean }>((resolve) => {
          resolveBootstrap = resolve;
        }),
    );
    const { unmount } = render(<DesktopLocalProviderSettings />);

    unmount();
    await act(async () => {
      resolveBootstrap?.({ isOfflineMode: true });
    });

    expect(mocks.getProviderConfig).not.toHaveBeenCalled();
  });

  it('shows a recoverable inactive state when bootstrap fails', async () => {
    mocks.getBootstrap.mockRejectedValueOnce(
      new Error('Bootstrap could not confirm Local mode'),
    );
    render(<DesktopLocalProviderSettings />);

    expect(await screen.findByText('Local generation is off')).toBeVisible();
    expect(
      await screen.findByText('Bootstrap could not confirm Local mode'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Use a local workspace' }),
    ).toBeDisabled();
    expect(mocks.getProviderConfig).not.toHaveBeenCalled();
    expect(mocks.saveProviderConfig).not.toHaveBeenCalled();
    expect(mocks.testProviderConfig).not.toHaveBeenCalled();
  });
});
