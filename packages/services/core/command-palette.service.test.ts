// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger to suppress output during tests
vi.mock('@services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import type { ICommand } from '@genfeedai/contracts/interfaces/ui/command-palette.interface';
import { CommandPaletteService } from '@services/core/command-palette.service';
import { logger } from '@services/core/logger.service';

function makeCommand(
  id: string,
  label: string,
  overrides: Partial<ICommand> = {},
): ICommand {
  return {
    action: vi.fn(),
    category: 'test',
    description: `${label} description`,
    id,
    keywords: [label.toLowerCase()],
    label,
    priority: 5,
    ...overrides,
  };
}

describe('CommandPaletteService', () => {
  beforeEach(() => {
    CommandPaletteService.clearCommands();
    vi.clearAllMocks();
  });

  afterEach(() => {
    CommandPaletteService.clearCommands();
  });

  describe('registerCommands', () => {
    it('registers a command and increments count', () => {
      CommandPaletteService.registerCommands([makeCommand('cmd-1', 'Test')]);
      expect(CommandPaletteService.getCommandCount()).toBe(1);
    });

    it('does not info-log routine registration', () => {
      CommandPaletteService.registerCommands([makeCommand('cmd-1', 'Test')]);
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Commands registered', {
        commandIds: ['cmd-1'],
        count: 1,
      });
    });

    it('does not register duplicate command ids', () => {
      CommandPaletteService.registerCommands([makeCommand('dup', 'First')]);
      CommandPaletteService.registerCommands([makeCommand('dup', 'Second')]);
      expect(CommandPaletteService.getCommandCount()).toBe(1);
    });
  });

  describe('registerCommands batch', () => {
    it('registers multiple commands at once', () => {
      CommandPaletteService.registerCommands([
        makeCommand('a', 'Alpha'),
        makeCommand('b', 'Beta'),
      ]);
      expect(CommandPaletteService.getCommandCount()).toBe(2);
    });

    it('returns the ids that were registered', () => {
      const registeredIds = CommandPaletteService.registerCommands([
        makeCommand('a', 'Alpha'),
        makeCommand('b', 'Beta'),
      ]);
      expect(registeredIds).toEqual(['a', 'b']);
    });

    it('returns only newly registered ids when some already exist', () => {
      CommandPaletteService.registerCommands([makeCommand('a', 'Alpha')]);
      const registeredIds = CommandPaletteService.registerCommands([
        makeCommand('a', 'Alpha Again'),
        makeCommand('b', 'Beta'),
      ]);
      expect(registeredIds).toEqual(['b']);
      expect(CommandPaletteService.getCommandCount()).toBe(2);
    });
  });

  describe('unregisterCommands batch', () => {
    it('removes all given commands', () => {
      CommandPaletteService.registerCommands([
        makeCommand('a', 'Alpha'),
        makeCommand('b', 'Beta'),
      ]);
      CommandPaletteService.unregisterCommands(['a', 'b']);
      expect(CommandPaletteService.getCommandCount()).toBe(0);
    });

    it('does not throw for unknown command ids', () => {
      CommandPaletteService.registerCommands([makeCommand('keep', 'Keep')]);
      expect(() =>
        CommandPaletteService.unregisterCommands(['ghost', 'keep']),
      ).not.toThrow();
      expect(CommandPaletteService.getCommandCount()).toBe(0);
    });
  });

  describe('remount lifecycle (register → unregister → register)', () => {
    it('does not warn "Commands already registered" when re-registering after cleanup', () => {
      const commands = [makeCommand('a', 'Alpha'), makeCommand('b', 'Beta')];

      // Mount: register
      const registeredIds = CommandPaletteService.registerCommands(commands);
      // Unmount cleanup: unregister exactly what was registered
      CommandPaletteService.unregisterCommands(registeredIds);
      // Remount (re-navigation / StrictMode): register again
      CommandPaletteService.registerCommands(commands);

      expect(logger.warn).not.toHaveBeenCalled();
      expect(CommandPaletteService.getCommandCount()).toBe(2);
    });

    it('keeps each command exactly once after remount', () => {
      const commands = [makeCommand('a', 'Alpha')];

      const registeredIds = CommandPaletteService.registerCommands(commands);
      CommandPaletteService.unregisterCommands(registeredIds);
      CommandPaletteService.registerCommands(commands);

      const ids = CommandPaletteService.getAllCommands().map((c) => c.id);
      expect(ids.filter((id) => id === 'a')).toHaveLength(1);
    });
  });

  describe('unregisterCommands', () => {
    it('removes a registered command', () => {
      CommandPaletteService.registerCommands([makeCommand('rm', 'Remove Me')]);
      CommandPaletteService.unregisterCommands(['rm']);
      expect(CommandPaletteService.getCommandCount()).toBe(0);
    });

    it('is a no-op for unknown command ids', () => {
      CommandPaletteService.registerCommands([makeCommand('keep', 'Keep')]);
      CommandPaletteService.unregisterCommands(['nonexistent']);
      expect(CommandPaletteService.getCommandCount()).toBe(1);
    });
  });

  describe('searchCommands', () => {
    it('returns all commands for empty query', () => {
      CommandPaletteService.registerCommands([
        makeCommand('s1', 'Search One'),
        makeCommand('s2', 'Search Two'),
      ]);
      const results = CommandPaletteService.searchCommands('');
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id)).toContain('s1');
      expect(results.map((r) => r.id)).toContain('s2');
    });

    it('returns matching commands for a query', () => {
      CommandPaletteService.registerCommands([
        // Use priority 0 to avoid score inflation from non-matching commands
        makeCommand('unique-xyz', 'Unique XYZ', { priority: 0 }),
        makeCommand('other-abc', 'Other ABC', { priority: 0 }),
      ]);
      const results = CommandPaletteService.searchCommands('unique xyz');
      const ids = results.map((r) => r.id);
      expect(ids).toContain('unique-xyz');
    });

    it('excludes commands whose condition() returns false', () => {
      CommandPaletteService.registerCommands([
        makeCommand('hidden', 'Hidden Command', { condition: () => false }),
      ]);
      const results = CommandPaletteService.searchCommands('hidden');
      expect(results.map((r) => r.id)).not.toContain('hidden');
    });

    it('getAllCommands returns all registered commands that pass condition', () => {
      CommandPaletteService.registerCommands([
        makeCommand('a1', 'Visible A'),
        makeCommand('a2', 'Visible B'),
        makeCommand('a3', 'Invisible C', { condition: () => false }),
      ]);
      const all = CommandPaletteService.getAllCommands();
      const ids = all.map((c) => c.id);
      expect(ids).toContain('a1');
      expect(ids).toContain('a2');
      expect(ids).not.toContain('a3');
    });
  });

  describe('executeCommand', () => {
    it('calls the command action', async () => {
      const action = vi.fn();
      CommandPaletteService.registerCommands([
        makeCommand('exec', 'Execute Me', { action }),
      ]);
      await CommandPaletteService.executeCommand('exec');
      expect(action).toHaveBeenCalledOnce();
    });

    it('throws for unknown command ids', async () => {
      await expect(
        CommandPaletteService.executeCommand('ghost'),
      ).rejects.toThrow('Command not found: ghost');
    });

    it('throws when command action throws', async () => {
      const action = vi.fn().mockRejectedValue(new Error('action failed'));
      CommandPaletteService.registerCommands([
        makeCommand('fail-cmd', 'Fail', { action }),
      ]);
      await expect(
        CommandPaletteService.executeCommand('fail-cmd'),
      ).rejects.toThrow('action failed');
    });
  });

  describe('getCommandCount', () => {
    it('returns 0 when no commands are registered', () => {
      expect(CommandPaletteService.getCommandCount()).toBe(0);
    });

    it('returns correct count after multiple registrations', () => {
      CommandPaletteService.registerCommands([makeCommand('c1', 'One')]);
      CommandPaletteService.registerCommands([makeCommand('c2', 'Two')]);
      CommandPaletteService.registerCommands([makeCommand('c3', 'Three')]);
      expect(CommandPaletteService.getCommandCount()).toBe(3);
    });
  });

  describe('clearCommands', () => {
    it('removes all registered commands', () => {
      CommandPaletteService.registerCommands([
        makeCommand('x', 'X'),
        makeCommand('y', 'Y'),
      ]);
      CommandPaletteService.clearCommands();
      expect(CommandPaletteService.getCommandCount()).toBe(0);
    });
  });
});
