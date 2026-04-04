import { useCommandPalette } from '@hooks/ui/use-command-palette/use-command-palette';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the context
const mockContext = {
  close: vi.fn(),
  executeCommand: vi.fn(),
  open: vi.fn(),
  registerCommand: vi.fn(),
  registerCommands: vi.fn(),
  selectNext: vi.fn(),
  selectPrevious: vi.fn(),
  setQuery: vi.fn(),
  state: {
    commands: [],
    filteredCommands: [],
    isOpen: false,
    query: '',
    selectedIndex: 0,
  },
  toggle: vi.fn(),
  unregisterCommand: vi.fn(),
};

let mockContextValue: typeof mockContext | null = mockContext;

vi.mock('@contexts/features/command-palette.context', () => ({
  CommandPaletteContext: {
    Consumer: ({ children }: any) => children(mockContextValue),
    Provider: ({ children, value }: any) => children,
  },
}));

// Override useContext to return our mock
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useContext: vi.fn(() => mockContextValue),
  };
});

describe('useCommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContextValue = mockContext;
  });

  describe('Context Access', () => {
    it('returns context when used within provider', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(result.current).toBeDefined();
      expect(result.current.state).toBeDefined();
    });

    it('throws error when used outside provider', () => {
      mockContextValue = null;

      expect(() => {
        renderHook(() => useCommandPalette());
      }).toThrow(
        'useCommandPalette must be used within CommandPaletteProvider',
      );
    });
  });

  describe('State Access', () => {
    it('provides access to isOpen state', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(result.current.state.isOpen).toBe(false);
    });

    it('provides access to query state', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(result.current.state.query).toBe('');
    });

    it('provides access to commands array', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(result.current.state.commands).toEqual([]);
    });

    it('provides access to filteredCommands array', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(result.current.state.filteredCommands).toEqual([]);
    });

    it('provides access to selectedIndex', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(result.current.state.selectedIndex).toBe(0);
    });
  });

  describe('Open/Close Methods', () => {
    it('provides open method', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(typeof result.current.open).toBe('function');
    });

    it('provides close method', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(typeof result.current.close).toBe('function');
    });

    it('provides toggle method', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(typeof result.current.toggle).toBe('function');
    });
  });

  describe('Query Methods', () => {
    it('provides setQuery method', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(typeof result.current.setQuery).toBe('function');
    });
  });

  describe('Command Methods', () => {
    it('provides executeCommand method', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(typeof result.current.executeCommand).toBe('function');
    });

    it('provides registerCommand method', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(typeof result.current.registerCommand).toBe('function');
    });

    it('provides unregisterCommand method', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(typeof result.current.unregisterCommand).toBe('function');
    });

    it('provides registerCommands method for batch registration', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(typeof result.current.registerCommands).toBe('function');
    });
  });

  describe('Navigation Methods', () => {
    it('provides selectNext method', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(typeof result.current.selectNext).toBe('function');
    });

    it('provides selectPrevious method', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(typeof result.current.selectPrevious).toBe('function');
    });
  });

  describe('All Return Values', () => {
    it('returns all expected properties', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(result.current).toHaveProperty('state');
      expect(result.current).toHaveProperty('open');
      expect(result.current).toHaveProperty('close');
      expect(result.current).toHaveProperty('toggle');
      expect(result.current).toHaveProperty('setQuery');
      expect(result.current).toHaveProperty('executeCommand');
      expect(result.current).toHaveProperty('registerCommand');
      expect(result.current).toHaveProperty('unregisterCommand');
      expect(result.current).toHaveProperty('registerCommands');
      expect(result.current).toHaveProperty('selectNext');
      expect(result.current).toHaveProperty('selectPrevious');
    });

    it('state contains all expected properties', () => {
      const { result } = renderHook(() => useCommandPalette());

      expect(result.current.state).toHaveProperty('isOpen');
      expect(result.current.state).toHaveProperty('query');
      expect(result.current.state).toHaveProperty('commands');
      expect(result.current.state).toHaveProperty('filteredCommands');
      expect(result.current.state).toHaveProperty('selectedIndex');
    });
  });

  describe('With Custom State', () => {
    it('reflects open state when command palette is open', () => {
      mockContextValue = {
        ...mockContext,
        state: {
          ...mockContext.state,
          isOpen: true,
        },
      };

      const { result } = renderHook(() => useCommandPalette());

      expect(result.current.state.isOpen).toBe(true);
    });

    it('reflects query when search is active', () => {
      mockContextValue = {
        ...mockContext,
        state: {
          ...mockContext.state,
          query: 'search term',
        },
      };

      const { result } = renderHook(() => useCommandPalette());

      expect(result.current.state.query).toBe('search term');
    });

    it('reflects commands when registered', () => {
      const mockCommands = [
        { action: vi.fn(), id: 'cmd-1', name: 'Command 1' },
        { action: vi.fn(), id: 'cmd-2', name: 'Command 2' },
      ];

      mockContextValue = {
        ...mockContext,
        state: {
          ...mockContext.state,
          commands: mockCommands,
          filteredCommands: mockCommands,
        },
      };

      const { result } = renderHook(() => useCommandPalette());

      expect(result.current.state.commands).toHaveLength(2);
      expect(result.current.state.filteredCommands).toHaveLength(2);
    });

    it('reflects selected index for navigation', () => {
      mockContextValue = {
        ...mockContext,
        state: {
          ...mockContext.state,
          selectedIndex: 2,
        },
      };

      const { result } = renderHook(() => useCommandPalette());

      expect(result.current.state.selectedIndex).toBe(2);
    });
  });
});
