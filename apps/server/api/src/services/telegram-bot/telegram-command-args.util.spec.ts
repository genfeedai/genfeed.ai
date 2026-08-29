import { extractCommandArgs } from '@api/services/telegram-bot/telegram-command-args.util';
import { describe, expect, it } from 'vitest';

describe('extractCommandArgs', () => {
  it('returns the trimmed text after the slash command', () => {
    expect(
      extractCommandArgs({
        message: { text: '/connect   gf_example' },
      } as never),
    ).toBe('gf_example');
  });

  it('returns an empty string when there is no argument or message', () => {
    expect(extractCommandArgs({ message: { text: '/help' } } as never)).toBe(
      '',
    );
    expect(extractCommandArgs({} as never)).toBe('');
    expect(extractCommandArgs({ message: {} } as never)).toBe('');
  });
});
