import { describe, expect, it } from 'vitest';
import { createProgram, resolveLaunchMode } from '../src/program';

describe('terminal program', () => {
  it('registers the canonical terminal content namespaces', () => {
    const commandNames = createProgram().commands.map((command) => command.name());

    expect(commandNames).toEqual(
      expect.arrayContaining([
        'asset',
        'balance',
        'brand',
        'credits',
        'gen',
        'job',
        'login',
        'signup',
        'workflow',
      ])
    );
  });

  it('keeps the published command spellings as aliases', () => {
    const commands = createProgram().commands;
    const aliases = Object.fromEntries(
      commands.map((command) => [command.name(), command.aliases()])
    );

    expect(aliases.asset).toContain('library');
    expect(aliases.brand).toContain('brands');
    expect(aliases.gen).toContain('generate');
  });

  it.each([
    [{ hasArguments: true, stdinIsTTY: true, stdoutIsTTY: true }, 'command'],
    [{ hasArguments: false, stdinIsTTY: true, stdoutIsTTY: true }, 'tui'],
    [{ hasArguments: false, stdinIsTTY: false, stdoutIsTTY: true }, 'help'],
    [{ hasArguments: false, stdinIsTTY: true, stdoutIsTTY: false }, 'help'],
  ] as const)('resolves launch mode from process capabilities', (input, expected) => {
    expect(resolveLaunchMode(input)).toBe(expected);
  });
});
