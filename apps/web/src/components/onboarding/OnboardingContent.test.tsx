import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingContent } from './OnboardingContent';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: mockPush,
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock setup API
const mockValidateKey = vi.fn();
const mockComplete = vi.fn();
const mockDetectTools = vi.fn();

vi.mock('@/lib/api/setup', () => ({
  setupApi: {
    complete: (...args: unknown[]) => mockComplete(...args),
    detectTools: (...args: unknown[]) => mockDetectTools(...args),
    validateKey: (...args: unknown[]) => mockValidateKey(...args),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock settingsStore (dynamic import in handleSubmit)
const mockSetProviderKey = vi.fn();
const mockSetHasSeenWelcome = vi.fn();

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      setHasSeenWelcome: mockSetHasSeenWelcome,
      setProviderKey: mockSetProviderKey,
    }),
  },
}));

describe('OnboardingContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: detectTools resolves with no tools
    mockDetectTools.mockResolvedValue({
      anthropic: { installed: false },
      claude: { installed: false },
      codex: { installed: false },
      replicate: { installed: false },
    });
  });

  describe('rendering', () => {
    it('should render the setup screen with heading and input', () => {
      render(<OnboardingContent />);

      expect(screen.getByText('Get started')).toBeInTheDocument();
      expect(screen.getByText(/Add your Replicate API key/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('r8_...')).toBeInTheDocument();
      expect(screen.getByText('Validate')).toBeInTheDocument();
      expect(screen.getByText('Start Creating')).toBeInTheDocument();
    });

    it('should render the API key input as password by default', () => {
      render(<OnboardingContent />);

      const input = screen.getByPlaceholderText('r8_...');
      expect(input).toHaveAttribute('type', 'password');
    });

    it('should render the Replicate link', () => {
      render(<OnboardingContent />);

      const link = screen.getByText(/Get your key/);
      expect(link).toHaveAttribute('href', 'https://replicate.com/account/api-tokens');
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  describe('password visibility toggle', () => {
    it('should toggle input type when eye icon is clicked', () => {
      render(<OnboardingContent />);

      const input = screen.getByPlaceholderText('r8_...');
      const toggleButton = screen.getByLabelText('Show API key');

      expect(input).toHaveAttribute('type', 'password');

      fireEvent.click(toggleButton);
      expect(input).toHaveAttribute('type', 'text');

      const hideButton = screen.getByLabelText('Hide API key');
      fireEvent.click(hideButton);
      expect(input).toHaveAttribute('type', 'password');
    });
  });

  describe('validation', () => {
    it('should call setupApi.validateKey on validate button click', async () => {
      mockValidateKey.mockResolvedValueOnce({ message: 'Key is valid', valid: true });
      render(<OnboardingContent />);

      const input = screen.getByPlaceholderText('r8_...');
      fireEvent.change(input, { target: { value: 'r8_test_key' } });

      const validateButton = screen.getByText('Validate');
      fireEvent.click(validateButton);

      await waitFor(() => {
        expect(mockValidateKey).toHaveBeenCalledWith({
          apiKey: 'r8_test_key',
          provider: 'replicate',
        });
      });
    });

    it('should show success status after valid key', async () => {
      mockValidateKey.mockResolvedValueOnce({ message: 'Key is valid', valid: true });
      render(<OnboardingContent />);

      const input = screen.getByPlaceholderText('r8_...');
      fireEvent.change(input, { target: { value: 'r8_test_key' } });

      fireEvent.click(screen.getByText('Validate'));

      await waitFor(() => {
        expect(screen.getByText('Key is valid')).toBeInTheDocument();
      });
    });

    it('should show error status after invalid key', async () => {
      mockValidateKey.mockResolvedValueOnce({ message: 'Invalid API key', valid: false });
      render(<OnboardingContent />);

      const input = screen.getByPlaceholderText('r8_...');
      fireEvent.change(input, { target: { value: 'bad_key' } });

      fireEvent.click(screen.getByText('Validate'));

      await waitFor(() => {
        expect(screen.getByText('Invalid API key')).toBeInTheDocument();
      });
    });

    it('should show fallback error when validation throws', async () => {
      mockValidateKey.mockRejectedValueOnce(new Error('Network error'));
      render(<OnboardingContent />);

      const input = screen.getByPlaceholderText('r8_...');
      fireEvent.change(input, { target: { value: 'r8_test_key' } });

      fireEvent.click(screen.getByText('Validate'));

      await waitFor(() => {
        expect(
          screen.getByText('Validation failed. Check your connection and try again.')
        ).toBeInTheDocument();
      });
    });

    it('should disable validate button when input is empty', () => {
      render(<OnboardingContent />);

      const validateButton = screen.getByText('Validate');
      expect(validateButton).toBeDisabled();
    });

    it('should reset validation when key changes after validation', async () => {
      mockValidateKey.mockResolvedValueOnce({ message: 'Key is valid', valid: true });
      render(<OnboardingContent />);

      const input = screen.getByPlaceholderText('r8_...');
      fireEvent.change(input, { target: { value: 'r8_test_key' } });
      fireEvent.click(screen.getByText('Validate'));

      await waitFor(() => {
        expect(screen.getByText('Key is valid')).toBeInTheDocument();
      });

      // Change the key — validation message should disappear
      fireEvent.change(input, { target: { value: 'r8_different' } });

      expect(screen.queryByText('Key is valid')).not.toBeInTheDocument();
    });
  });

  describe('submit', () => {
    it('should disable submit button when input is empty', () => {
      render(<OnboardingContent />);

      const submitButton = screen.getByText('Start Creating');
      expect(submitButton).toBeDisabled();
    });

    it('should call setupApi.complete and sync to settings store', async () => {
      mockValidateKey.mockResolvedValue({ message: 'Key is valid', valid: true });
      mockComplete.mockResolvedValueOnce({ hasCompletedSetup: true });
      render(<OnboardingContent />);

      const input = screen.getByPlaceholderText('r8_...');
      fireEvent.change(input, { target: { value: 'r8_test_key' } });

      // Validate first
      fireEvent.click(screen.getByText('Validate'));
      await waitFor(() => {
        expect(screen.getByText('Key is valid')).toBeInTheDocument();
      });

      // Then submit
      fireEvent.click(screen.getByText('Start Creating'));

      await waitFor(() => {
        expect(mockComplete).toHaveBeenCalledWith({ replicateApiKey: 'r8_test_key' });
      });

      await waitFor(() => {
        expect(mockSetProviderKey).toHaveBeenCalledWith('replicate', 'r8_test_key');
        expect(mockSetHasSeenWelcome).toHaveBeenCalledWith(true);
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('should auto-validate before submit if not yet validated', async () => {
      mockValidateKey.mockResolvedValueOnce({ message: 'Key is valid', valid: true });
      mockComplete.mockResolvedValueOnce({ hasCompletedSetup: true });
      render(<OnboardingContent />);

      const input = screen.getByPlaceholderText('r8_...');
      fireEvent.change(input, { target: { value: 'r8_test_key' } });

      // Submit without validating first
      fireEvent.click(screen.getByText('Start Creating'));

      await waitFor(() => {
        expect(mockValidateKey).toHaveBeenCalledWith({
          apiKey: 'r8_test_key',
          provider: 'replicate',
        });
      });

      await waitFor(() => {
        expect(mockComplete).toHaveBeenCalled();
      });
    });

    it('should not complete setup if auto-validation fails', async () => {
      mockValidateKey.mockResolvedValueOnce({ message: 'Invalid key', valid: false });
      render(<OnboardingContent />);

      const input = screen.getByPlaceholderText('r8_...');
      fireEvent.change(input, { target: { value: 'bad_key' } });

      fireEvent.click(screen.getByText('Start Creating'));

      await waitFor(() => {
        expect(mockValidateKey).toHaveBeenCalled();
      });

      // complete should NOT have been called
      expect(mockComplete).not.toHaveBeenCalled();
    });

    it('should show error when setup completion fails', async () => {
      mockValidateKey.mockResolvedValueOnce({ valid: true });
      mockComplete.mockRejectedValueOnce(new Error('Server error'));
      render(<OnboardingContent />);

      const input = screen.getByPlaceholderText('r8_...');
      fireEvent.change(input, { target: { value: 'r8_test_key' } });

      // Validate first
      fireEvent.click(screen.getByText('Validate'));
      await waitFor(() => {
        expect(mockValidateKey).toHaveBeenCalled();
      });

      // Submit
      fireEvent.click(screen.getByText('Start Creating'));

      await waitFor(() => {
        expect(screen.getByText('Setup failed. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('detected tools', () => {
    it('should show loading state while detecting tools', () => {
      // Don't resolve the promise — keep it pending
      mockDetectTools.mockReturnValueOnce(new Promise(() => {}));
      render(<OnboardingContent />);

      expect(screen.getByText('Detecting tools...')).toBeInTheDocument();
    });

    it('should render detected tools when API returns data', async () => {
      mockDetectTools.mockResolvedValueOnce({
        anthropic: { installed: true },
        claude: { installed: false },
        codex: { installed: true },
        replicate: { installed: true },
      });

      render(<OnboardingContent />);

      await waitFor(() => {
        expect(screen.getByText('Codex CLI')).toBeInTheDocument();
        expect(screen.getByText('Claude CLI')).toBeInTheDocument();
        expect(screen.getByText('ANTHROPIC_API_KEY')).toBeInTheDocument();
      });

      // Check installed/missing status text
      expect(screen.getByText('installed')).toBeInTheDocument();
      expect(screen.getByText('not found')).toBeInTheDocument();
      expect(screen.getByText('available')).toBeInTheDocument();
    });

    it('should still render when detectTools fails', async () => {
      mockDetectTools.mockRejectedValueOnce(new Error('API unreachable'));
      render(<OnboardingContent />);

      // Component should still render — tools section stays in loading state
      expect(screen.getByText('Get started')).toBeInTheDocument();
      expect(screen.getByText('Detecting tools...')).toBeInTheDocument();
    });
  });
});
