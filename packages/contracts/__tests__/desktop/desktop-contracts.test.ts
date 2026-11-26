import { describe, expect, it } from 'vitest';
import {
  buildDesktopThreadLink,
  DESKTOP_IPC_CHANNELS,
  parseDesktopThreadLink,
} from '../../src/desktop';

describe('desktop thread links', () => {
  it('round-trips a thread id through the deep link', () => {
    const link = buildDesktopThreadLink('thread_123-ABC');

    expect(link).toBe('genfeedai-desktop://thread/thread_123-ABC');
    expect(parseDesktopThreadLink(link)).toBe('thread_123-ABC');
  });

  it('refuses to build a link for an unsafe thread id', () => {
    expect(() => buildDesktopThreadLink('bad/id')).toThrow(
      'Invalid desktop thread id.',
    );
    expect(() => buildDesktopThreadLink('')).toThrow(
      'Invalid desktop thread id.',
    );
  });

  it('parses only well-formed thread links', () => {
    expect(parseDesktopThreadLink('genfeedai-desktop://auth')).toBeNull();
    expect(parseDesktopThreadLink('genfeedai-desktop://thread/')).toBeNull();
    expect(parseDesktopThreadLink('genfeedai-desktop://thread/a/b')).toBeNull();
    expect(
      parseDesktopThreadLink('genfeedai-desktop://thread/a?code=1'),
    ).toBeNull();
    expect(
      parseDesktopThreadLink('genfeedai-desktop://thread/%2e%2e%2fadmin'),
    ).toBeNull();
    expect(
      parseDesktopThreadLink('https://app.genfeed.ai/thread/thread-1'),
    ).toBeNull();
    expect(parseDesktopThreadLink('not a url')).toBeNull();
  });
});

describe('DESKTOP_IPC_CHANNELS', () => {
  it('prefixes every channel with desktop:', () => {
    for (const channel of Object.values(DESKTOP_IPC_CHANNELS)) {
      expect(channel).toMatch(/^desktop:/);
    }
  });

  it('has no duplicate channel names', () => {
    const values = Object.values(DESKTOP_IPC_CHANNELS);

    expect(new Set(values).size).toBe(values.length);
  });
});
