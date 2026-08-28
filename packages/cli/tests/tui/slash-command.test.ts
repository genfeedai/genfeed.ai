import { describe, expect, it } from 'vitest';
import { parseSlashCommand } from '@/tui/slash-command';

describe('TUI slash commands', () => {
  it.each([
    ['/balance', { args: [], name: 'balance' }],
    ['/credits buy 5000', { args: ['buy', '5000'], name: 'credits' }],
    ['/brand use "Acme Studio"', { args: ['use', 'Acme Studio'], name: 'brand' }],
    ['/workflow run weekly-content', { args: ['run', 'weekly-content'], name: 'workflow' }],
    ['/image cinematic launch poster', { args: ['cinematic', 'launch', 'poster'], name: 'image' }],
    ['/IMAGE launch poster', { args: ['launch', 'poster'], name: 'image' }],
  ])('parses %s', (input, expected) => {
    expect(parseSlashCommand(input)).toEqual(expected);
  });

  it('rejects shell command spelling outside the TUI', () => {
    expect(() => parseSlashCommand('workflow list')).toThrow('must start with /');
  });

  it('rejects unterminated quotes', () => {
    expect(() => parseSlashCommand('/brand use "Acme')).toThrow('Unterminated quote');
  });
});
