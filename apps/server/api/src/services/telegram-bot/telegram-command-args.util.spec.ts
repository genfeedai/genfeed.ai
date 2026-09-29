import { extractCommandArgs } from '@api/services/telegram-bot/telegram-command-args.util';
import { describe, expect, it } from 'vitest';

describe('extractCommandArgs', () => {
  it('returns an empty string when there is no argument or message', () => {
    expect(extractCommandArgs({ message: { text: '/help' } } as never)).toBe(
      '',
    );
    expect(extractCommandArgs({} as never)).toBe('');
    expect(extractCommandArgs({ message: {} } as never)).toBe('');
  });
});
