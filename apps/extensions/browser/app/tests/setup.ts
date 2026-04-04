import '@testing-library/jest-dom';
import * as React from 'react';
import { vi } from 'vitest';

// Make React globally available
globalThis.React = React;

// Mock Chrome APIs globally
Object.defineProperty(global, 'chrome', {
  value: {
    cookies: {
      get: vi.fn(),
      getAll: vi.fn(),
      remove: vi.fn(),
      set: vi.fn(),
    },
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      sendMessage: vi.fn(),
    },
    scripting: {
      executeScript: vi.fn(),
    },
    storage: {
      local: {
        clear: vi.fn(),
        get: vi.fn(),
        remove: vi.fn(),
        set: vi.fn(),
      },
      sync: {
        clear: vi.fn(),
        get: vi.fn(),
        remove: vi.fn(),
        set: vi.fn(),
      },
    },
    tabs: {
      create: vi.fn(),
      query: vi.fn(),
      sendMessage: vi.fn(),
      update: vi.fn(),
    },
  },
  writable: true,
});

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

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  disconnect: vi.fn(),
  observe: vi.fn(),
  unobserve: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  disconnect: vi.fn(),
  observe: vi.fn(),
  unobserve: vi.fn(),
}));
