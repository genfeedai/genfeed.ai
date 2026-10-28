import {
  buildUnresolvedBriefMessage,
  findUnresolvedBrief,
  formatBriefLabels,
  VIDEO_BRIEF_CHECKLIST,
} from '@api/services/agent-orchestrator/utils/agent-generation-brief.util';
import { AgentGenerationMode } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const chatContext = { hostSupportsApproval: true, threadId: 'thread-1' };
const ids = (brief: ReturnType<typeof findUnresolvedBrief>) =>
  brief?.fields.map((field) => field.id);

describe('findUnresolvedBrief for a video', () => {
  it('asks for the format and the length when a chat video names neither', () => {
    const brief = findUnresolvedBrief(
      'generate',
      { prompt: 'A launch teaser', type: 'video' },
      chatContext,
    );

    expect(brief?.kind).toBe('video');
    expect(ids(brief)).toEqual(['aspectRatio', 'duration']);
  });

  it('asks only for what is missing', () => {
    expect(
      ids(
        findUnresolvedBrief(
          'generate',
          { aspectRatio: '9:16', prompt: 'A teaser', type: 'video' },
          chatContext,
        ),
      ),
    ).toEqual(['duration']);
  });

  it('is satisfied by a format, and a length given as a number or numeric text', () => {
    for (const duration of [8, '8']) {
      expect(
        findUnresolvedBrief(
          'generate',
          { aspectRatio: ' 9:16 ', duration, type: 'video' },
          chatContext,
        ),
      ).toBeNull();
    }
  });

  it.each([
    ['a blank format', { aspectRatio: '  ', duration: 8 }],
    ['a zero length', { aspectRatio: '9:16', duration: 0 }],
    [
      'a length that is not a number',
      { aspectRatio: '9:16', duration: 'long' },
    ],
  ])('does not count %s as settled', (_label, settled) => {
    expect(
      findUnresolvedBrief(
        'generate',
        { ...settled, type: 'video' },
        chatContext,
      ),
    ).not.toBeNull();
  });
});

describe('findUnresolvedBrief for an image', () => {
  it('asks for the format when a chat image names none', () => {
    const brief = findUnresolvedBrief(
      'generate',
      { prompt: 'A product shot', type: 'image' },
      chatContext,
    );

    expect(brief?.kind).toBe('image');
    expect(ids(brief)).toEqual(['aspectRatio']);
  });

  it('is satisfied by a format and never asks for a length', () => {
    expect(
      findUnresolvedBrief(
        'generate',
        { aspectRatio: '1:1', prompt: 'A product shot', type: 'image' },
        chatContext,
      ),
    ).toBeNull();
  });
});

describe('findUnresolvedBrief for a post', () => {
  it.each(['caption', 'post', 'thread', 'article_outline'])(
    'asks for the platform when a chat %s names none',
    (type) => {
      const brief = findUnresolvedBrief(
        'generate_content',
        { topic: 'Our launch', type },
        chatContext,
      );

      expect(brief?.kind).toBe('post');
      expect(ids(brief)).toEqual(['platform']);
    },
  );

  it('is satisfied by a platform', () => {
    expect(
      findUnresolvedBrief(
        'generate_content',
        { platform: 'linkedin', topic: 'Our launch', type: 'post' },
        chatContext,
      ),
    ).toBeNull();
  });

  it.each(['script', 'newsletter', 'article', 'x-article', undefined])(
    'leaves a %s alone',
    (type) => {
      expect(
        findUnresolvedBrief(
          'generate_content',
          { topic: 'Our launch', type },
          chatContext,
        ),
      ).toBeNull();
    },
  );
});

describe('findUnresolvedBrief when nothing needs asking', () => {
  it.each([
    ['another tool', 'generate_turbo_content', { type: 'video' }, chatContext],
    ['audio', 'generate', { type: 'voice' }, chatContext],
    [
      'a composer media mode',
      'generate',
      { type: 'video' },
      { ...chatContext, generationMode: AgentGenerationMode.VIDEO },
    ],
    [
      'composer settings',
      'generate',
      { type: 'image' },
      { ...chatContext, generationSettings: { aspectRatio: '9:16' } },
    ],
    [
      'a confirmed card',
      'generate',
      { type: 'video' },
      { ...chatContext, confirmationOrigin: 'thread-ui-action' as const },
    ],
    [
      'a proactive run',
      'generate_content',
      { type: 'post' },
      { ...chatContext, isProactive: true },
    ],
    [
      'a budgeted run',
      'generate',
      { type: 'image' },
      { ...chatContext, creditBudget: 10 },
    ],
    [
      'a call without a thread',
      'generate_content',
      { type: 'post' },
      { hostSupportsApproval: true },
    ],
    [
      'a host that cannot show a card',
      'generate',
      { type: 'video' },
      { threadId: 'thread-1' },
    ],
  ])('leaves %s alone', (_label, toolName, parameters, ctx) => {
    expect(
      findUnresolvedBrief(
        toolName,
        parameters,
        ctx as Parameters<typeof findUnresolvedBrief>[2],
      ),
    ).toBeNull();
  });
});

describe('buildUnresolvedBriefMessage', () => {
  it('names each missing video field with its sample options and points at request_input', () => {
    const message = buildUnresolvedBriefMessage({
      fields: VIDEO_BRIEF_CHECKLIST.filter((field) => field.parameter),
      kind: 'video',
      toolName: 'generate',
    });

    expect(message).toContain('Ask before building this video');
    expect(message).toContain('platform and aspect ratio (9:16');
    expect(message).toContain('duration (a length in seconds');
    expect(message).toContain('request_input');
    expect(message).toContain('call generate again');
  });

  it('names the post and the tool for a post', () => {
    const brief = findUnresolvedBrief(
      'generate_content',
      { type: 'post' },
      chatContext,
    );
    expect(brief).not.toBeNull();
    const message = buildUnresolvedBriefMessage(
      brief ?? { fields: [], kind: 'post', toolName: 'generate_content' },
    );

    expect(message).toContain('Ask before building this post');
    expect(message).toContain('platform (instagram, linkedin');
    expect(message).toContain('call generate_content again');
  });
});

describe('formatBriefLabels', () => {
  it.each([
    [['a'], 'a'],
    [['a', 'b'], 'a and b'],
    [['a', 'b', 'c'], 'a, b and c'],
    [[], ''],
  ])('joins %j as %j', (labels, expected) => {
    expect(formatBriefLabels(labels)).toBe(expected);
  });
});
