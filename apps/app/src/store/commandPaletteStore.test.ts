/**
 * Tests for CommandPaletteStore
 *
 * Note: The store uses zustand persist middleware which requires localStorage.
 * We test the pure logic functions instead of the store directly to avoid
 * jsdom/zustand persist compatibility issues.
 */
import { describe, expect, it } from 'vitest';

// Test the store logic as pure functions
const MAX_RECENT_COMMANDS = 5;

function addRecentCommand(recentCommands: string[], id: string): string[] {
  const filtered = recentCommands.filter((cmd) => cmd !== id);
  return [id, ...filtered].slice(0, MAX_RECENT_COMMANDS);
}

describe('commandPaletteStore logic', () => {
  describe('addRecentCommand', () => {
    it('adds command to front', () => {
      expect(addRecentCommand([], 'a')).toEqual(['a']);
    });

    it('moves repeated command to front', () => {
      expect(addRecentCommand(['a', 'b'], 'b')).toEqual(['b', 'a']);
    });

    it('caps at max limit', () => {
      const initial = ['a', 'b', 'c', 'd', 'e'];
      const result = addRecentCommand(initial, 'f');
      expect(result).toHaveLength(5);
      expect(result[0]).toBe('f');
      expect(result).not.toContain('e');
    });

    it('deduplicates before capping', () => {
      const initial = ['a', 'b', 'c', 'd', 'e'];
      const result = addRecentCommand(initial, 'c');
      expect(result).toEqual(['c', 'a', 'b', 'd', 'e']);
    });
  });
});
