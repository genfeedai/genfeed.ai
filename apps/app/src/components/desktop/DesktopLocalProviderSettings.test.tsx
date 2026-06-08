import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopLocalProviderSettings from './DesktopLocalProviderSettings';

const mocks = vi.hoisted(() => ({
  bridge: null as null | {
    generation: {
      getProviderConfig: ReturnType<typeof vi.fn>;
      saveProviderConfig: ReturnType<typeof vi.fn>;
      testProviderConfig: ReturnType<typeof vi.fn>;
    };
  },
  getProviderConfig: vi.fn(),
  saveProviderConfig: vi.fn(),
  testProviderConfig: vi.fn(),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <section className={className}>{children}</section>,
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

    expect(screen.getByText('Local generation')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText('Local provider base URL')).toHaveValue(
        'http://localhost:9999/v1',
      );
      expect(screen.getByLabelText('Local provider model')).toHaveValue(
        'saved-model',
      );
      expect(screen.getByPlaceholderText('API key saved')).toBeInTheDocument();
    });
  });

  it('applies provider presets and saves trimmed provider credentials', async () => {
    render(<DesktopLocalProviderSettings variant="card" />);

    expect(
      screen.getByText(/Configure a local OpenAI-compatible provider/),
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

    fireEvent.click(screen.getByRole('button', { name: 'fal.ai' }));
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

  it('shows load, save, and test errors', async () => {
    mocks.getProviderConfig.mockRejectedValueOnce(new Error('load exploded'));
    render(<DesktopLocalProviderSettings />);

    expect(await screen.findByText('load exploded')).toBeInTheDocument();

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

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));

    expect(mocks.getProviderConfig).not.toHaveBeenCalled();
    expect(mocks.saveProviderConfig).not.toHaveBeenCalled();
    expect(mocks.testProviderConfig).not.toHaveBeenCalled();
  });
});
