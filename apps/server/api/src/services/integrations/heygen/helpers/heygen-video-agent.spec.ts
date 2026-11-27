import { describe, expect, it } from 'vitest';

import {
  buildHeyGenVideoAgentBody,
  heyGenVideoAgentStatusUrl,
  heyGenVideoAgentVideoUrl,
  isHeyGenVideoAgentTerminal,
  readHeyGenVideoAgentSession,
  readHeyGenVideoAgentStatus,
} from './heygen-video-agent';

describe('HeyGen Video Agent helper', () => {
  it('sends only the trimmed prompt and refuses an empty one', () => {
    expect(buildHeyGenVideoAgentBody('  a 20 second launch ad  ')).toEqual({
      prompt: 'a 20 second launch ad',
    });
    expect(() => buildHeyGenVideoAgentBody('   ')).toThrow(
      'HeyGen Video Agent requires a prompt.',
    );
  });

  it('builds the poll URL from the session id', () => {
    expect(heyGenVideoAgentStatusUrl('sess/1')).toBe(
      'https://api.heygen.com/v3/video-agents/sess%2F1',
    );
  });

  it('builds the finished-video URL from the video id', () => {
    expect(heyGenVideoAgentVideoUrl('v/1')).toBe(
      'https://api.heygen.com/v3/videos/v%2F1',
    );
  });

  it.each([
    [
      { data: { session_id: 's1', video_id: 'v1' } },
      { sessionId: 's1', videoId: 'v1' },
    ],
    [{ data: { session_id: 's1' } }, { sessionId: 's1' }],
    [{ data: { video_id: 'v1' } }, undefined],
    [null, undefined],
  ])('reads the session from %j', (payload, expected) => {
    expect(readHeyGenVideoAgentSession(payload)).toEqual(expected);
  });

  it('reads a status, treating a missing one as pending', () => {
    expect(
      readHeyGenVideoAgentStatus({
        data: {
          failure_message: 'no credits',
          status: 'failed',
          video_id: 'v1',
        },
      }),
    ).toEqual({
      failureMessage: 'no credits',
      status: 'failed',
      videoId: 'v1',
    });
    expect(readHeyGenVideoAgentStatus({ data: {} })).toEqual({
      status: 'pending',
    });
  });

  it.each([
    ['completed', true],
    ['failed', true],
    ['cancelled', true],
    ['running', false],
    ['some_new_status', false],
  ])('treats %s as terminal: %s', (status, expected) => {
    expect(isHeyGenVideoAgentTerminal(status)).toBe(expected);
  });
});
