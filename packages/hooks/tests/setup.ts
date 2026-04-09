import '@testing-library/jest-dom';
import * as React from 'react';
import { vi } from 'vitest';
import { installVitestWarningFilter } from '../../../configs/vitest-warning-filter';

// Make React globally available
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
installVitestWarningFilter();

// Mock axios to prevent config errors in service imports
vi.mock('axios', () => {
  const mockAxiosInstance = {
    defaults: { headers: { common: {} } },
    delete: vi.fn().mockResolvedValue({ data: {} }),
    get: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    patch: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  };

  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      isAxiosError: vi.fn(() => false),
    },
    isAxiosError: vi.fn(() => false),
  };
});

// Mock the base service to avoid axios initialization issues
vi.mock('@genfeedai/services/core/base.service', () => ({
  BaseService: class MockBaseService {
    static getInstance = vi.fn();
    instance = {
      delete: vi.fn().mockResolvedValue({ data: {} }),
      get: vi.fn().mockResolvedValue({ data: {} }),
      patch: vi.fn().mockResolvedValue({ data: {} }),
      post: vi.fn().mockResolvedValue({ data: {} }),
      put: vi.fn().mockResolvedValue({ data: {} }),
    };
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'brand-slug', orgSlug: 'acme' }),
  usePathname: () => '/acme/brand-slug/publisher/posts/post-1',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock ResizeObserver as a class so UI libs can instantiate it safely.
global.ResizeObserver = class ResizeObserver {
  disconnect() {
    /* noop mock */
  }
  observe() {
    /* noop mock */
  }
  unobserve() {
    /* noop mock */
  }
} as unknown as typeof globalThis.ResizeObserver;
window.ResizeObserver = global.ResizeObserver;

// Mock IntersectionObserver as a class for the same reason.
global.IntersectionObserver = class IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  disconnect() {
    /* noop mock */
  }
  observe() {
    /* noop mock */
  }
  unobserve() {
    /* noop mock */
  }
  takeRecords() {
    return [];
  }
} as unknown as typeof globalThis.IntersectionObserver;
window.IntersectionObserver = global.IntersectionObserver;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })),
  writable: true,
});

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true,
});

// Mock fetch
global.fetch = vi.fn();

Object.defineProperty(window, 'localStorage', {
  value: {
    clear: vi.fn(),
    getItem: vi.fn(() => null),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  },
  writable: true,
});

const originalConsoleError = console.error.bind(console);

function isReactActWarning(firstArg: unknown) {
  return (
    typeof firstArg === 'string' &&
    firstArg.startsWith('An update to ') &&
    firstArg.includes(' inside a test was not wrapped in act(...)')
  );
}

vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
  if (isReactActWarning(args[0])) {
    return;
  }

  originalConsoleError(...args);
});
