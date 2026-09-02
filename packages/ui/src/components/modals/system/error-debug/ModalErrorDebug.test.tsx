import { ModalEnum } from '@genfeedai/contracts';
import type { IErrorDebugInfo } from '@genfeedai/contracts/interfaces/modals/error-debug.interface';
import { openModal as openModalHelper } from '@genfeedai/helpers/ui/modal/modal.helper';
import {
  clearErrorDebugInfo,
  setErrorDebugInfo,
} from '@genfeedai/services/core/error-debug-store';
import ModalErrorDebug from '@ui/modals/system/error-debug/ModalErrorDebug';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Next.js router before importing the component
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockPrefetch = vi.fn();
const mockBack = vi.fn();
const mockForward = vi.fn();
const mockRefresh = vi.fn();
const mockCopyToClipboard = vi.fn().mockResolvedValue(undefined);

vi.mock('next/navigation', () => ({
  usePathname: () => '/test',
  useRouter: () => ({
    back: mockBack,
    forward: mockForward,
    prefetch: mockPrefetch,
    push: mockPush,
    refresh: mockRefresh,
    replace: mockReplace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock modules
vi.mock('@genfeedai/helpers/ui/modal/modal.helper', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@genfeedai/helpers/ui/modal/modal.helper')
    >();
  return {
    ...actual,
    closeModal: vi.fn(actual.closeModal),
  };
});

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: vi.fn(() => ({
      copyToClipboard: mockCopyToClipboard,
    })),
  },
}));

// Mock navigator.clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});

function triggerOpenModal(id: string) {
  act(() => {
    openModalHelper(id);
  });
}

describe('ModalErrorDebug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearErrorDebugInfo();
  });

  afterEach(() => {
    clearErrorDebugInfo();
  });

  it('should not render when no error info is set', () => {
    render(<ModalErrorDebug />);
    // Modal is not open, so dialog content should not be in the DOM
    expect(screen.queryByText('Request failed')).not.toBeInTheDocument();
  });

  it('should render when error info is set', () => {
    const errorInfo: IErrorDebugInfo = {
      message: 'Test error message',
      method: 'POST',
      status: 500,
      statusText: 'Internal Server Error',
      timestamp: '2024-01-01T00:00:00Z',
      url: 'https://api.example.com/test',
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    expect(screen.getByText('Request failed')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should display all error details', () => {
    const errorInfo: IErrorDebugInfo = {
      errorCode: 'ERR_NOT_FOUND',
      message: 'API Error',
      method: 'GET',
      status: 404,
      statusText: 'Not Found',
      timestamp: '2024-01-01T12:00:00Z',
      url: 'https://api.example.com/data',
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    expect(screen.getByText('API Error')).toBeInTheDocument();
    expect(
      screen.getByText('https://api.example.com/data'),
    ).toBeInTheDocument();
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('404 Not Found')).toBeInTheDocument();
    expect(screen.getByText('ERR_NOT_FOUND')).toBeInTheDocument();
    expect(screen.getByText('2024-01-01T12:00:00Z')).toBeInTheDocument();
  });

  it('should handle close button click', () => {
    const errorInfo: IErrorDebugInfo = {
      message: 'Error to close',
      timestamp: '2024-01-01T00:00:00Z',
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    // The Radix Dialog close button has sr-only text "Close"
    const closeButton = screen.getByRole('button', {
      hidden: true,
      name: /^close$/i,
    });
    expect(closeButton).toBeInTheDocument();
    fireEvent.click(closeButton);
  });

  it('copies the full agent dump and per-section payloads', () => {
    const errorInfo: IErrorDebugInfo = {
      message: 'Copy test error',
      method: 'POST',
      status: 400,
      timestamp: '2024-01-01T00:00:00Z',
      url: 'https://api.example.com/copy',
      response: { data: { errors: [{ title: 'boom' }] } },
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    fireEvent.click(
      screen.getByRole('button', { hidden: true, name: /copy for agent/i }),
    );
    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('## Request failed — agent debug dump'),
    );
    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('Copy test error'),
    );

    fireEvent.click(
      screen.getByRole('button', { hidden: true, name: /copy request/i }),
    );
    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('url: https://api.example.com/copy'),
    );

    fireEvent.click(
      screen.getByRole('button', { hidden: true, name: /copy response/i }),
    );
    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      expect.stringContaining('"title": "boom"'),
    );
  });

  it('should display response data when available', () => {
    const errorInfo: IErrorDebugInfo = {
      message: 'Response error',
      response: {
        data: {
          details: 'Missing required field',
          error: 'Invalid request',
        },
      },
      timestamp: '2024-01-01T00:00:00Z',
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    expect(screen.getByText('Response')).toBeInTheDocument();
  });

  it('should toggle response data expansion', () => {
    const errorInfo: IErrorDebugInfo = {
      message: 'Expandable error',
      response: {
        data: {
          error: 'Test error',
        },
      },
      timestamp: '2024-01-01T00:00:00Z',
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    const expandButton = screen.getByText('Response').closest('button');
    expect(expandButton).toBeInTheDocument();
    if (!expandButton) {
      throw new Error('Response button not found');
    }

    // Initially expanded
    expect(screen.getByText(/"error":/)).toBeInTheDocument();

    // Click to collapse
    fireEvent.click(expandButton);
    expect(screen.queryByText(/"error":/)).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(expandButton);
    expect(screen.getByText(/"error":/)).toBeInTheDocument();
  });

  it('should display stack trace when available', () => {
    const errorInfo: IErrorDebugInfo = {
      message: 'Error with stack',
      stack:
        'Error: Test error\n    at function1 (file.js:10)\n    at function2 (file.js:20)',
      timestamp: '2024-01-01T00:00:00Z',
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    expect(screen.getByText('Stack')).toBeInTheDocument();
  });

  it('should display additional context when available', () => {
    const errorInfo: IErrorDebugInfo = {
      context: {
        action: 'upload',
        fileSize: 1024,
        userId: '123',
      },
      message: 'Error with context',
      timestamp: '2024-01-01T00:00:00Z',
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    expect(screen.getByText('Context')).toBeInTheDocument();
  });

  it('should handle request details', () => {
    const errorInfo: IErrorDebugInfo = {
      message: 'Request error',
      request: {
        body: {
          data: 'test',
        },
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        },
        params: {
          id: '123',
        },
      },
      timestamp: '2024-01-01T00:00:00Z',
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    expect(screen.getByText('Request error')).toBeInTheDocument();
  });

  it('should handle minimal error info', () => {
    const errorInfo: IErrorDebugInfo = {
      message: 'Minimal error',
      timestamp: '2024-01-01T00:00:00Z',
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    expect(screen.getByText('Minimal error')).toBeInTheDocument();
    expect(screen.getByText('2024-01-01T00:00:00Z')).toBeInTheDocument();

    // Should not show optional fields
    expect(screen.queryByText('URL')).not.toBeInTheDocument();
    expect(screen.queryByText('Method')).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    // 'Code', not 'Error Code' — #2466 shortened the label. The old string is
    // one the component can no longer render under any input, so asserting its
    // absence passed regardless of behaviour.
    expect(screen.queryByText('Code')).not.toBeInTheDocument();
  });

  it('should clear error info on close', () => {
    const errorInfo: IErrorDebugInfo = {
      message: 'Error to clear',
      timestamp: '2024-01-01T00:00:00Z',
    };

    setErrorDebugInfo(errorInfo);
    const { rerender } = render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    expect(screen.getByText('Error to clear')).toBeInTheDocument();

    // The Radix Dialog close button has sr-only text "Close"
    const closeButton = screen.getByRole('button', {
      hidden: true,
      name: /^close$/i,
    });
    fireEvent.click(closeButton);

    rerender(<ModalErrorDebug />);

    expect(screen.queryByText('Error to clear')).not.toBeInTheDocument();
  });

  it('should handle status without statusText', () => {
    const errorInfo: IErrorDebugInfo = {
      message: 'Status error',
      status: 403,
      timestamp: '2024-01-01T00:00:00Z',
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    expect(screen.getByText(/403/)).toBeInTheDocument();
  });

  it('should handle empty context object', () => {
    const errorInfo: IErrorDebugInfo = {
      context: {},
      message: 'Error with empty context',
      timestamp: '2024-01-01T00:00:00Z',
    };

    setErrorDebugInfo(errorInfo);
    render(<ModalErrorDebug />);
    triggerOpenModal(ModalEnum.ERROR_DEBUG);

    expect(screen.getByText('Error with empty context')).toBeInTheDocument();

    // Should not show Context section for empty object
    expect(screen.queryByText('Context')).not.toBeInTheDocument();
  });
});
