import { describe, expect, it } from 'vitest';
import { DEFAULT_TALKING_HEAD_SCRIPT_DATA } from './talking-head-script';

describe('talking-head-script node', () => {
  it('defaults to a 30-second, five-clip script at 3.5 words per second', () => {
    expect(DEFAULT_TALKING_HEAD_SCRIPT_DATA).toMatchObject({
      clipCount: 5,
      durationSeconds: 30,
      language: 'en',
      label: 'Talking-head Script',
      status: 'idle',
      type: 'talkingHeadScript',
      wordsPerSecond: 3.5,
    });
  });
});
