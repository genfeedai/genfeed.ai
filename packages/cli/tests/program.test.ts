import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { createProgram, resolveLaunchMode } from '@/program';

describe('terminal program', () => {
  it('registers the canonical terminal content namespaces', () => {
    const commandNames = createProgram().commands.map((command) => command.name());

    expect(commandNames).toEqual(
      expect.arrayContaining([
        'admin',
        'asset',
        'balance',
        'brand',
        'credits',
        'gen',
        'host',
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

  it('hands a subcommand its own --version option instead of printing the CLI version', async () => {
    const program = createProgram().exitOverride();
    const approve = ['admin', 'pricing', 'approve'].reduce<Command | undefined>(
      (parent, name) => parent?.commands.find((command) => command.name() === name),
      program
    );
    const received: unknown[] = [];
    approve?.action((model: string, options: unknown) => {
      received.push(model, options);
    });

    await program.parseAsync(
      ['admin', 'pricing', 'approve', 'alibaba/wan-3', '--version', 'sha256:abc', '--yes'],
      { from: 'user' }
    );

    expect(received).toEqual(['alibaba/wan-3', { version: 'sha256:abc', yes: true }]);
  });

  it('still prints the CLI version for a bare --version', async () => {
    const writes: string[] = [];
    const program = createProgram()
      .exitOverride()
      .configureOutput({ writeOut: (text) => writes.push(text) });

    await expect(program.parseAsync(['--version'], { from: 'user' })).rejects.toMatchObject({
      code: 'commander.version',
    });
    expect(writes).toEqual(['0.6.0\n']);
  });
});
