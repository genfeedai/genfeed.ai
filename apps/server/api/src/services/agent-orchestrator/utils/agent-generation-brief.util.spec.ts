import {
  buildUnresolvedBriefMessage,
  findUnresolvedVideoBriefFields,
  formatBriefLabels,
  VIDEO_BRIEF_CHECKLIST,
} from '@api/services/agent-orchestrator/utils/agent-generation-brief.util';
import { AgentGenerationMode } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const chatContext = { hostSupportsApproval: true, threadId: 'thread-1' };
const ids = (fields: { id: string }[]) => fields.map((field) => field.id);

describe('findUnresolvedVideoBriefFields', () => {
  it('asks for the format and the length when a chat video names neither', () => {
    expect(
      ids(
        findUnresolvedVideoBriefFields(
          'generate',
          { prompt: 'A launch teaser', type: 'video' },
          chatContext,
        ),
      ),
    ).toEqual(['aspectRatio', 'duration']);
  });

  it('asks only for what is missing', () => {
    expect(
      ids(
        findUnresolvedVideoBriefFields(
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
        findUnresolvedVideoBriefFields(
          'generate',
          { aspectRatio: ' 9:16 ', duration, type: 'video' },
          chatContext,
        ),
      ).toEqual([]);
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
      findUnresolvedVideoBriefFields(
        'generate',
        { ...settled, type: 'video' },
        chatContext,
      ),
    ).not.toEqual([]);
  });

  it.each([
    ['an image', 'generate', { type: 'image' }, chatContext],
    ['another tool', 'generate_content', { type: 'video' }, chatContext],
    [
      'a composer media mode',
      'generate',
      { type: 'video' },
      { ...chatContext, generationMode: AgentGenerationMode.VIDEO },
    ],
    [
      'composer settings',
      'generate',
      { type: 'video' },
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
      'generate',
      { type: 'video' },
      { ...chatContext, isProactive: true },
    ],
    [
      'a budgeted run',
      'generate',
      { type: 'video' },
      { ...chatContext, creditBudget: 10 },
    ],
    [
      'a call without a thread',
      'generate',
      { type: 'video' },
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
      findUnresolvedVideoBriefFields(
        toolName,
        parameters,
        ctx as Parameters<typeof findUnresolvedVideoBriefFields>[2],
      ),
    ).toEqual([]);
  });
});

describe('buildUnresolvedBriefMessage', () => {
  it('names each missing field with its sample options and points at request_input', () => {
    const message = buildUnresolvedBriefMessage(
      VIDEO_BRIEF_CHECKLIST.filter((field) => field.parameter),
    );

    expect(message).toContain('platform and aspect ratio (9:16');
    expect(message).toContain('duration (a length in seconds');
    expect(message).toContain('request_input');
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
