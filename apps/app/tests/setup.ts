import '@testing-library/jest-dom/vitest';
import path from 'node:path';

const appRoot = path.resolve(__dirname, '..');

if (process.cwd() !== appRoot) {
  process.chdir(appRoot);
}

const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    get length() {
      return Object.keys(store).length;
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
  writable: true,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
    writable: true,
  });
}

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
