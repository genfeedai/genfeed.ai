import '@testing-library/jest-dom';
import * as React from 'react';
import { afterAll, beforeAll, vi } from 'vitest';

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

function shouldSuppressTestNoise(message: string): boolean {
  return (
    message.includes('Warning:') ||
    message.includes('not wrapped in act(...)') ||
    message.includes('The tag <stop> is unrecognized in this browser') ||
    message.includes(
      'The tag <linearGradient> is unrecognized in this browser',
    ) ||
    message.includes('The tag <defs> is unrecognized in this browser') ||
    message.includes('<linearGradient /> is using incorrect casing') ||
    message.includes('Consider adding an error boundary') ||
    message.includes('validateDOMNesting') ||
    message.includes('Sourcemap for ') ||
    message.includes(
      'Missing `Description` or `aria-describedby={undefined}`',
    ) ||
    message.includes('`DialogContent` requires a `DialogTitle`') ||
    message.includes(
      'You provided a `value` prop to a form field without an `onChange` handler.',
    ) ||
    message.includes(
      'You provided a `checked` prop to a form field without an `onChange` handler.',
    ) ||
    message.includes(
      '`value` prop on `input` should not be null. Consider using an empty string',
    )
  );
}

// Mock console.error to reduce noise in tests (except for actual errors)
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalStderrWrite = process.stderr.write.bind(process.stderr);
beforeAll(() => {
  console.error = (...args: any[]) => {
    const message = args[0];
    if (typeof message === 'string' && shouldSuppressTestNoise(message)) {
      return;
    }
    originalConsoleError(...args);
  };

  console.warn = (...args: any[]) => {
    const message = args[0];
    if (typeof message === 'string' && shouldSuppressTestNoise(message)) {
      return;
    }
    originalConsoleWarn(...args);
  };

  process.stderr.write = ((chunk: any, encoding?: any, callback?: any) => {
    const text =
      typeof chunk === 'string'
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString()
          : '';

    if (text) {
      const filtered = text
        .split('\n')
        .filter((line) => !shouldSuppressTestNoise(line))
        .join('\n');

      if (!filtered.trim()) {
        if (typeof callback === 'function') {
          callback();
        }
        return true;
      }

      return originalStderrWrite(filtered, encoding, callback);
    }

    return originalStderrWrite(chunk, encoding, callback);
  }) as typeof process.stderr.write;
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  process.stderr.write = originalStderrWrite as typeof process.stderr.write;
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
window.ResizeObserver = global.ResizeObserver;

if (typeof globalThis.CSS === 'undefined') {
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: {},
    writable: true,
  });
}

if (typeof globalThis.CSS.registerProperty !== 'function') {
  Object.defineProperty(globalThis.CSS, 'registerProperty', {
    configurable: true,
    value: () => {},
    writable: true,
  });
}

if (typeof window.CSS === 'undefined') {
  Object.defineProperty(window, 'CSS', {
    configurable: true,
    value: globalThis.CSS,
    writable: true,
  });
}

if (typeof window.CSS.registerProperty !== 'function') {
  Object.defineProperty(window.CSS, 'registerProperty', {
    configurable: true,
    value: () => {},
    writable: true,
  });
}

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
window.IntersectionObserver = global.IntersectionObserver;

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
  usePathname: () => '/',
  useRouter: () => ({
    back: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) =>
    React.createElement(
      'a',
      {
        ...props,
        href,
        onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
          onClick?.(event);
        },
      },
      children,
    ),
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    blurDataURL: _blurDataURL,
    fill: _fill,
    loader: _loader,
    placeholder: _placeholder,
    priority: _priority,
    quality: _quality,
    unoptimized: _unoptimized,
    ...props
  }: Record<string, unknown>) =>
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
import '@ui/tests/global-mocks';
