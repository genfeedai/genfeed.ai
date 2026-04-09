import '@testing-library/jest-dom';
import * as React from 'react';
import { act } from 'react';
import { afterAll, beforeAll, vi } from 'vitest';

// React 19 removed act from default export — patch for @testing-library/react compatibility
(React as any).act = act;

// Ensure DOM environment is available
if (typeof global.document === 'undefined') {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    pretendToBeVisual: true,
    resources: 'usable',
    url: 'http://localhost',
  });
  global.document = dom.window.document;
  global.window = dom.window as any;
  global.navigator = dom.window.navigator;
}

// Make React globally available
globalThis.React = React;

// Mock console.error to reduce noise in tests (except for actual errors)
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    const message = args[0];
    // Let actual errors through, but suppress React warnings about missing providers etc.
    if (
      typeof message === 'string' &&
      (message.includes('Warning:') ||
        message.includes('Consider adding an error boundary') ||
        message.includes('validateDOMNesting'))
    ) {
      return;
    }
    originalConsoleError(...args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
});

// Mock ResizeObserver — must be a class (not vi.fn) to work as constructor in vitest 4 fork pool
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

// Mock IntersectionObserver — must be a class for the same reason
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

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
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

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({
    brandSlug: 'test-brand',
    orgSlug: 'test-org',
  }),
  usePathname: () => '/',
  useRouter: () => ({
    back: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) =>
    React.createElement('img', { alt, src, ...props }),
}));

// Mock @clerk/nextjs — nearly all components use useAuth/useUser/useOrganization
vi.mock('@clerk/nextjs', () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SignedIn: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SignedOut: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue('mock-token'),
    isLoaded: true,
    isSignedIn: true,
    orgId: 'org_test123',
    sessionId: 'sess_test123',
    userId: 'user_test123',
  }),
  useOrganization: () => ({
    isLoaded: true,
    membership: { role: 'org:admin' },
    organization: { id: 'org_test123', name: 'Test Org' },
  }),
  useOrganizationList: () => ({
    isLoaded: true,
    setActive: vi.fn(),
    userMemberships: { data: [] },
  }),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      emailAddresses: [{ emailAddress: 'test@example.com', id: 'email_1' }],
      firstName: 'Test',
      fullName: 'Test User',
      id: 'user_test123',
      imageUrl: 'https://example.com/avatar.png',
      lastName: 'User',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
  }),
}));

// Library-specific mocks (recharts, react-query, react-hook-form) have been
// moved to opt-in helpers in tests/mocks/ and test-utils.tsx. Tests that need
// them should import the relevant mock or use the provided wrapper/helpers.

// Mock CSS and static file imports
vi.mock('*.css', () => ({}));
vi.mock('*.scss', () => ({}));
vi.mock('*.png', () => 'test-image.png');
vi.mock('*.jpg', () => 'test-image.jpg');
vi.mock('*.jpeg', () => 'test-image.jpeg');
vi.mock('*.gif', () => 'test-image.gif');
vi.mock('*.svg', () => 'test-image.svg');
vi.mock('*.webp', () => 'test-image.webp');

// Import our global mocks to set up automatic module mocking
import '@agent-tests/global-mocks';
