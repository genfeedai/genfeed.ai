import { describe, expect, it } from 'vitest';
import {
  BATCH_TOPIC_ANGLE_TEMPLATES,
  buildBatchDiversityContext,
  expandBatchTopics,
} from './batch-topic-angles.util';

describe('expandBatchTopics', () => {
  it('returns empty for zero count', () => {
    expect(expandBatchTopics({ count: 0, topics: ['a'] })).toEqual([]);
  });

  it('preserves provided topics when enough exist', () => {
    expect(
      expandBatchTopics({
        count: 2,
        topics: ['alpha', 'beta', 'gamma'],
      }),
    ).toEqual(['alpha', 'beta']);
  });

  it('fills empty topics with distinct angles', () => {
    const topics = expandBatchTopics({
      count: 20,
      platforms: ['twitter'],
      style: 'bold image-first content for creators',
    });

    expect(topics).toHaveLength(20);
    expect(new Set(topics).size).toBe(20);
    expect(topics[0]).toContain('bold image-first content for creators');
    expect(topics[0]).toContain('platform:twitter');
    // First 20 angles use unique templates (no pass-2 suffix yet).
    expect(topics.every((t) => !t.includes('pass 2'))).toBe(true);
  });

  it('extends short topic lists without dropping user topics', () => {
    const topics = expandBatchTopics({
      count: 5,
      platforms: ['twitter', 'instagram'],
      topics: ['launch day'],
    });

    expect(topics[0]).toBe('launch day');
    expect(topics).toHaveLength(5);
    expect(new Set(topics).size).toBe(5);
  });

  it('uses more templates than a small batch needs', () => {
    expect(BATCH_TOPIC_ANGLE_TEMPLATES.length).toBeGreaterThanOrEqual(20);
  });
});

describe('buildBatchDiversityContext', () => {
  it('includes style, item index, and prior captions', () => {
    const lines = buildBatchDiversityContext({
      index: 2,
      priorCaptions: ['First draft', '  ', 'Second draft'],
      style: 'punchy',
      totalCount: 10,
    });

    expect(lines[0]).toBe('punchy');
    expect(lines[1]).toContain('Batch item 3 of 10');
    expect(lines[2]).toContain('1. First draft');
    expect(lines[2]).toContain('2. Second draft');
    expect(lines[2]).not.toContain('3.');
  });
});
