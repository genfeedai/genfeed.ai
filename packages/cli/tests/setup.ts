import { vi } from 'vitest';

// Mock chalk to return plain strings in tests
vi.mock('chalk', () => ({
  default: {
    blue: (s: string) => s,
    bold: (s: string) => s,
    cyan: (s: string) => s,
    dim: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
  },
}));

// Mock ora spinner
vi.mock('ora', () => ({
  default: (options: { text: string }) => ({
    fail: vi.fn().mockReturnThis(),
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    text: options.text,
  }),
}));
